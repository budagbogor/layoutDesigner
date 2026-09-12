import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { apiKey, baseUrl, model } = body;

    // Define the path to the .env file in the root of the project
    const envPath = path.join(process.cwd(), '.env');
    const envExamplePath = path.join(process.cwd(), '.env.example');

    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf8');
    } catch (error) {
      // If .env doesn't exist, try reading from .env.example
      try {
        envContent = await fs.readFile(envExamplePath, 'utf8');
      } catch (e) {
        // If both fail, start with an empty string
        envContent = '';
      }
    }

    // Helper to replace or append an env variable
    const updateEnvVar = (content: string, key: string, value: string) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const safeValue = value.includes(' ') || value.includes('#') ? `"${value}"` : value;
      if (regex.test(content)) {
        return content.replace(regex, `${key}=${safeValue}`);
      } else {
        return content.trim() + `\n${key}=${safeValue}\n`;
      }
    };

    if (apiKey !== undefined) envContent = updateEnvVar(envContent, 'SUMOPOD_API_KEY', apiKey);
    if (baseUrl !== undefined) envContent = updateEnvVar(envContent, 'SUMOPOD_BASE_URL', baseUrl);
    if (model !== undefined) envContent = updateEnvVar(envContent, 'SUMOPOD_MODEL', model);

    await fs.writeFile(envPath, envContent.trim() + '\n', 'utf8');

    return NextResponse.json({ success: true, message: 'Configuration saved globally to .env' });
  } catch (error) {
    console.error('Failed to save config:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to save configuration globally.' },
      { status: 500 }
    );
  }
}
