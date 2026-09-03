import { LocalProjectRepository } from '@/application/adapters/LocalProjectRepository';
import { AppShell } from '@/presentation/components/workspace/AppShell';
import { getSumoPodEnvConfig } from '@/application/ai/providerConfig';

export default async function Page() {
  const repo = new LocalProjectRepository();
  const project = await repo.getProjectById('demo-001');

  if (!project) {
    return <div>Project not found</div>;
  }

  const envConfig = getSumoPodEnvConfig();

  return (
    <AppShell
      initialProject={project}
      initialMode="ai"
      initialApiKey={envConfig.apiKey}
      initialBaseUrl={envConfig.baseUrl}
      initialModel={envConfig.model}
    />
  );
}
