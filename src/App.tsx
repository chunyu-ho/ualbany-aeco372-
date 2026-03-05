import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Area, 
  AreaChart,
  ReferenceLine,
  ComposedChart
} from 'recharts';
import { format, parseISO, subYears, isAfter, isBefore, startOfMonth, addMonths } from 'date-fns';
import { TrendingUp, Calendar, AlertCircle, Loader2, Info, ChevronRight, Download, BrainCircuit, Settings2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getInflationForecast, ForecastResult } from './services/forecastService';

interface Observation {
  date: string;
  value: string;
}

interface FredData {
  observations: Observation[];
}

export default function App() {
  const [data, setData] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [forecasting, setForecasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  
  // Forecast Settings
  const [forecastSettings, setForecastSettings] = useState({
    numSamples: 10,
    trainingLength: 60,
    testLength: 12,
    rangeStart: '2010-01-01',
    rangeEnd: '2025-12-31'
  });

  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '2010-01-01',
    end: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/inflation');
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch data');
        }
        const result: FredData = await response.json();
        setData(result.observations);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const historicalProcessed = useMemo(() => {
    if (data.length === 0) return [];

    return data
      .map((obs, index) => {
        const currentVal = parseFloat(obs.value);
        if (isNaN(currentVal)) return null;

        const twelveMonthsAgoIndex = index - 12;
        if (twelveMonthsAgoIndex < 0) return null;

        const prevVal = parseFloat(data[twelveMonthsAgoIndex].value);
        if (isNaN(prevVal)) return null;

        const yoyInflation = ((currentVal - prevVal) / prevVal) * 100;

        return {
          date: obs.date,
          displayDate: format(parseISO(obs.date), 'MMM yyyy'),
          inflation: parseFloat(yoyInflation.toFixed(2)),
          cpi: currentVal,
          type: 'historical'
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [data]);

  const chartData = useMemo(() => {
    const historical = historicalProcessed.filter(item => {
      const itemDate = parseISO(item.date);
      return (
        isAfter(itemDate, parseISO(dateRange.start)) &&
        isBefore(itemDate, parseISO(dateRange.end))
      );
    });

    if (!forecastResult) return historical;

    const forecast = forecastResult.forecast.map(f => ({
      date: f.date,
      displayDate: format(parseISO(f.date), 'MMM yyyy'),
      forecast: f.value,
      type: 'forecast'
    }));

    // Combine and ensure continuity
    const lastHistorical = historical[historical.length - 1];
    const forecastWithConnection = lastHistorical 
      ? [{ ...lastHistorical, forecast: lastHistorical.inflation }, ...forecast]
      : forecast;

    return [...historical, ...forecastWithConnection];
  }, [historicalProcessed, forecastResult, dateRange]);

  const stats = useMemo(() => {
    const filtered = historicalProcessed.filter(item => {
      const itemDate = parseISO(item.date);
      return isAfter(itemDate, parseISO(dateRange.start)) && isBefore(itemDate, parseISO(dateRange.end));
    });

    if (filtered.length === 0) return null;
    const latest = filtered[filtered.length - 1];
    const max = Math.max(...filtered.map(d => d.inflation));
    const min = Math.min(...filtered.map(d => d.inflation));
    const avg = filtered.reduce((acc, d) => acc + d.inflation, 0) / filtered.length;

    return { latest, max, min, avg: avg.toFixed(2) };
  }, [historicalProcessed, dateRange]);

  const handleForecast = async () => {
    try {
      setForecasting(true);
      // Filter data for the requested training range
      const trainingPool = historicalProcessed.filter(d => {
        const date = parseISO(d.date);
        return isAfter(date, parseISO(forecastSettings.rangeStart)) && 
               isBefore(date, parseISO(forecastSettings.rangeEnd));
      });

      if (trainingPool.length < forecastSettings.trainingLength + forecastSettings.testLength) {
        throw new Error("Not enough data in the selected range for the requested sample size.");
      }

      const result = await getInflationForecast(
        trainingPool,
        forecastSettings.numSamples,
        forecastSettings.trainingLength,
        forecastSettings.testLength
      );
      setForecastResult(result);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setForecasting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto" />
          <p className="text-slate-500 font-medium animate-pulse text-sm uppercase tracking-widest">Fetching Economic Data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-red-100 p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900">Configuration Required</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              {error.includes('FRED_API_KEY') 
                ? "To view real-time inflation data, you'll need to add your FRED API key to the environment variables."
                : error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <TrendingUp className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">US Inflation Tracker</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Real-time FRED Economic Data</p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Calendar className="w-4 h-4" />
              <span>{format(parseISO(dateRange.start), 'MMM yyyy')} — {format(parseISO(dateRange.end), 'MMM yyyy')}</span>
            </div>
            <button className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-800 transition-all shadow-sm flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        {/* Forecast Inquiry Box */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                <BrainCircuit className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="font-bold text-slate-800">AI Inflation Forecasting</h3>
            </div>
            {forecastResult && (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg Test RMSE</p>
                  <p className="text-sm font-bold text-indigo-600">{forecastResult.rmse.toFixed(4)}</p>
                </div>
                <button 
                  onClick={() => setForecastResult(null)}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          <div className="p-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Settings2 className="w-3 h-3" /> Samples & Length
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-500">Count</p>
                  <input 
                    type="number" 
                    value={forecastSettings.numSamples}
                    onChange={(e) => setForecastSettings(prev => ({ ...prev, numSamples: parseInt(e.target.value) }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-500">Train (Mo)</p>
                  <input 
                    type="number" 
                    value={forecastSettings.trainingLength}
                    onChange={(e) => setForecastSettings(prev => ({ ...prev, trainingLength: parseInt(e.target.value) }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-3 h-3" /> Training Pool Range
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-500">Start</p>
                  <input 
                    type="date" 
                    value={forecastSettings.rangeStart}
                    onChange={(e) => setForecastSettings(prev => ({ ...prev, rangeStart: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-500">End</p>
                  <input 
                    type="date" 
                    value={forecastSettings.rangeEnd}
                    onChange={(e) => setForecastSettings(prev => ({ ...prev, rangeEnd: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 flex items-end">
              <button 
                onClick={handleForecast}
                disabled={forecasting}
                className="w-full bg-indigo-600 text-white h-12 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-100"
              >
                {forecasting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing Patterns...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate 12-Month Forecast
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: 'Current Rate', value: `${stats?.latest?.inflation}%`, sub: 'Year-over-Year', color: 'text-blue-600' },
            { label: 'Period High', value: `${stats?.max}%`, sub: 'Highest in range', color: 'text-red-500' },
            { label: 'Period Low', value: `${stats?.min}%`, sub: 'Lowest in range', color: 'text-emerald-500' },
            { label: 'Average', value: `${stats?.avg}%`, sub: 'Mean for period', color: 'text-slate-600' },
          ].map((stat, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              key={stat.label} 
              className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
            >
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
              <p className={`text-3xl font-bold tracking-tight ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-slate-500 mt-1 font-medium">{stat.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* Main Chart Section */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Inflation Rate History & Forecast</h2>
              <p className="text-slate-500 text-sm mt-1">Consumer Price Index for All Urban Consumers (YoY % Change)</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl mr-2">
                <input 
                  type="date" 
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="bg-transparent border-none text-xs font-bold text-slate-600 focus:ring-0 px-2 cursor-pointer"
                />
                <span className="text-slate-400 text-[10px] font-bold">TO</span>
                <input 
                  type="date" 
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="bg-transparent border-none text-xs font-bold text-slate-600 focus:ring-0 px-2 cursor-pointer"
                />
              </div>
              {[
                { label: '1Y', value: format(subYears(new Date(), 1), 'yyyy-MM-dd') },
                { label: '5Y', value: format(subYears(new Date(), 5), 'yyyy-MM-dd') },
                { label: '10Y', value: format(subYears(new Date(), 10), 'yyyy-MM-dd') },
                { label: 'ALL', value: '1913-01-01' },
              ].map((btn) => (
                <button
                  key={btn.label}
                  onClick={() => setDateRange(prev => ({ ...prev, start: btn.value }))}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    dateRange.start === btn.value 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' 
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[500px] w-full p-8">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="colorInflation" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="displayDate" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                  minTickGap={50}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                  tickFormatter={(val) => `${val}%`}
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-800">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                            {item.displayDate}
                          </p>
                          <div className="space-y-1">
                            {item.inflation !== undefined && (
                              <p className="text-lg font-bold">
                                {item.inflation}% <span className="text-xs font-normal text-slate-400 ml-1">Historical</span>
                              </p>
                            )}
                            {item.forecast !== undefined && (
                              <p className="text-lg font-bold text-indigo-400">
                                {item.forecast}% <span className="text-xs font-normal text-slate-400 ml-1">Forecast</span>
                              </p>
                            )}
                            {item.cpi && (
                              <p className="text-[10px] text-slate-500 font-medium">
                                CPI Index: {item.cpi.toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine y={2} stroke="#10b981" strokeDasharray="3 3" label={{ position: 'right', value: 'Fed Target (2%)', fill: '#10b981', fontSize: 10, fontWeight: 600 }} />
                <Area 
                  type="monotone" 
                  dataKey="inflation" 
                  stroke="#2563eb" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorInflation)" 
                  animationDuration={1500}
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke="#6366f1"
                  strokeWidth={3}
                  strokeDasharray="5 5"
                  dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
                  animationDuration={2000}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Info Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-blue-600">
              <Info className="w-6 h-6" />
              <h3 className="text-lg font-bold">About the Data</h3>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              This dashboard tracks the <strong>Consumer Price Index (CPI)</strong> for All Urban Consumers, which measures the average change over time in the prices paid by urban consumers for a market basket of consumer goods and services.
            </p>
            <p className="text-slate-600 text-sm leading-relaxed">
              The inflation rate shown is the <strong>Year-over-Year (YoY)</strong> percentage change, calculated by comparing the current month's CPI to the same month in the previous year.
            </p>
          </div>

          <div className="bg-slate-900 p-8 rounded-3xl text-white space-y-6 relative overflow-hidden">
            <div className="relative z-10 space-y-4">
              <h3 className="text-lg font-bold">AI Forecasting Methodology</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Our forecasting model uses Gemini 3.1 Pro to analyze historical patterns. It performs <strong>backtesting</strong> by training on random samples from your selected range and validating against the subsequent 12 months to calculate the Root Mean Square Error (RMSE).
              </p>
              <a 
                href="https://fred.stlouisfed.org/series/CPIAUCSL" 
                target="_blank"
                className="inline-flex items-center gap-2 text-sm font-bold text-blue-400 hover:text-blue-300 transition-colors"
              >
                View original series on FRED
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
            {/* Decorative element */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-200">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-xs text-slate-400 font-medium tracking-wide uppercase">
            Data provided by Federal Reserve Economic Data (FRED)
          </p>
          <div className="flex gap-8">
            <a href="#" className="text-xs text-slate-400 hover:text-slate-600 font-bold uppercase tracking-widest">Documentation</a>
            <a href="#" className="text-xs text-slate-400 hover:text-slate-600 font-bold uppercase tracking-widest">API Status</a>
            <a href="#" className="text-xs text-slate-400 hover:text-slate-600 font-bold uppercase tracking-widest">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
