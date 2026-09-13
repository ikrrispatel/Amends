import { PostgresDemoRunRepository } from './postgres-demo-run-repository';

export function createPostgresDemoRunRepository(): PostgresDemoRunRepository {
  return new PostgresDemoRunRepository();
}

export { PostgresDemoRunRepository } from './postgres-demo-run-repository';
