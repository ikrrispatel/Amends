import { PostgresDemoRunRepository } from '../src/infrastructure/persistence/postgres-demo-run-repository';

const repository = new PostgresDemoRunRepository();

void (async () => {
  await repository.migrate();
  await repository.close();
  console.log('Database migration complete.');
})();
