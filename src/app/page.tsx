import { LocalProjectRepository } from '@/application/adapters/LocalProjectRepository';
import { CadWorkspace } from '@/presentation/components/workspace/CadWorkspace';

export default async function Page() {
  const repo = new LocalProjectRepository();
  const project = await repo.getProjectById('demo-001');

  if (!project) {
    return <div>Project not found</div>;
  }

  return <CadWorkspace initialProject={project} />;
}
