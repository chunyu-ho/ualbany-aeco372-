import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ForecastResult {
  forecast: { date: string; value: number }[];
  rmse: number;
  sampleEvaluations: {
    sampleId: number;
    rmse: number;
  }[];
}

export async function getInflationForecast(
  historicalData: { date: string; inflation: number }[],
  numSamples: number,
  trainingLength: number,
  testLength: number
): Promise<ForecastResult> {
  const model = "gemini-3.1-pro-preview";
  
  // Prepare samples for backtesting
  const samples = [];
  const totalLength = trainingLength + testLength;
  
  // We want to pick samples from the historical data
  // Avoid the very end so we have "future" data to test against
  const availableData = historicalData.slice(0, historicalData.length - testLength);
  
  for (let i = 0; i < numSamples; i++) {
    const startIndex = Math.floor(Math.random() * (availableData.length - totalLength));
    const training = historicalData.slice(startIndex, startIndex + trainingLength);
    const test = historicalData.slice(startIndex + trainingLength, startIndex + totalLength);
    samples.push({
      id: i + 1,
      training: training.map(d => d.inflation),
      test: test.map(d => d.inflation)
    });
  }

  // The actual data for the real forecast (the most recent trainingLength months)
  const realTrainingData = historicalData.slice(-trainingLength);

  const prompt = `
    You are an expert economic forecaster. I am providing you with historical US Inflation (YoY %) data.
    
    TASK 1: Backtesting
    I have provided ${numSamples} historical samples. Each sample has a "training" period of ${trainingLength} months and a "test" period of ${testLength} months.
    For each sample, analyze the training data and predict the test data. Calculate the RMSE (Root Mean Square Error) for your prediction against the actual test data.
    
    TASK 2: Future Forecast
    Based on the most recent ${trainingLength} months of data, forecast the inflation for the NEXT ${testLength} months.
    
    DATA SAMPLES:
    ${JSON.stringify(samples)}
    
    MOST RECENT DATA (for future forecast):
    ${JSON.stringify(realTrainingData.map(d => d.inflation))}
    
    RESPONSE FORMAT:
    Return a JSON object with:
    1. "sampleEvaluations": Array of { "sampleId": number, "rmse": number }
    2. "forecast": Array of ${testLength} numbers representing the predicted inflation for the next ${testLength} months.
    3. "averageRmse": The mean RMSE across all samples.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sampleEvaluations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sampleId: { type: Type.INTEGER },
                rmse: { type: Type.NUMBER }
              },
              required: ["sampleId", "rmse"]
            }
          },
          forecast: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER }
          },
          averageRmse: { type: Type.NUMBER }
        },
        required: ["sampleEvaluations", "forecast", "averageRmse"]
      }
    }
  });

  const result = JSON.parse(response.text || "{}");
  
  // Generate dates for the forecast
  const lastDate = new Date(historicalData[historicalData.length - 1].date);
  const forecastWithDates = result.forecast.map((val: number, i: number) => {
    const date = new Date(lastDate);
    date.setMonth(date.getMonth() + i + 1);
    return {
      date: date.toISOString().split('T')[0],
      value: val
    };
  });

  return {
    forecast: forecastWithDates,
    rmse: result.averageRmse,
    sampleEvaluations: result.sampleEvaluations
  };
}
