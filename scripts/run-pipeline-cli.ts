import { runPipeline } from './run-pipeline';

runPipeline().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

