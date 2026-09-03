// ---------------------------------------------------------------------------
// FASE 3.7 — AI Workshop Assistant (Primary Experience Container)
//
// The premier entry point of the application:
// - Provider Configuration Header (SumoPod API key, model selection, test connection)
// - Requirement Input (presets, natural-language textarea, analyze button)
// - Structured AI Analysis Result (COMPLETE, NEEDS_CLARIFICATION, INVALID)
// ---------------------------------------------------------------------------

'use client';

import React from 'react';
import { useAiWorkshopAssistant, UseAiWorkshopAssistantOptions } from './useAiWorkshopAssistant';
import { AiProviderConfigPanel } from './AiProviderConfigPanel';
import { AiRequirementInputPanel } from './AiRequirementInputPanel';
import { AiAnalysisResultPanel } from './AiAnalysisResultPanel';

export interface AiWorkshopAssistantProps extends UseAiWorkshopAssistantOptions {
  readonly onOpenCadWorkspace?: () => void;
}

export const AiWorkshopAssistant: React.FC<AiWorkshopAssistantProps> = (props) => {
  const {
    baseUrl,
    apiKey,
    model,
    availableModels,
    isTestingConnection,
    isLoadingModels,
    connectionResult,
    prompt,
    isAnalyzing,
    analysisResult,
    analysisError,
    setApiKey,
    setModel,
    setPrompt,
    selectExamplePrompt,
    testConnection,
    loadModels,
    analyzeRequirement,
  } = useAiWorkshopAssistant(props);

  return (
    <div className="ai-experience-root" data-testid="ai-workshop-assistant-root">
      {/* 1. Provider Settings Bar */}
      <AiProviderConfigPanel
        baseUrl={baseUrl}
        apiKey={apiKey}
        model={model}
        availableModels={availableModels}
        isTestingConnection={isTestingConnection}
        isLoadingModels={isLoadingModels}
        connectionResult={connectionResult}
        onApiKeyChange={setApiKey}
        onModelChange={setModel}
        onTestConnection={() => testConnection()}
        onLoadModels={() => loadModels()}
      />

      {/* 2. Main Studio 2-Column Grid */}
      <div className="ai-studio-grid">
        {/* Left Column: Natural Language Input & Presets */}
        <AiRequirementInputPanel
          prompt={prompt}
          isAnalyzing={isAnalyzing}
          analysisError={analysisError}
          onPromptChange={setPrompt}
          onSelectExample={selectExamplePrompt}
          onAnalyze={() => analyzeRequirement()}
        />

        {/* Right Column: AI Analysis Result */}
        <AiAnalysisResultPanel
          result={analysisResult}
          isAnalyzing={isAnalyzing}
          onAppendOptionToPrompt={(option) => setPrompt(prompt ? `${prompt} ${option}` : option)}
        />
      </div>
    </div>
  );
};
