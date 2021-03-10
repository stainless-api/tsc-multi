import { dirname, resolve } from "path";
import { object, string, array, Infer, validate, optional } from "superstruct";
import Debug from "./debug";
import { readJSON, tryReadJSON } from "./utils";
import glob from "fast-glob";

const debug = Debug.extend("config");

const targetSchema = object({
  extname: optional(string()),
  module: optional(string()),
  target: optional(string()),
});

export type Target = Infer<typeof targetSchema>;

const configSchema = object({
  projects: optional(array(string())),
  targets: optional(array(targetSchema)),
  compiler: optional(string()),
});

export type InferConfig = Infer<typeof configSchema>;

export type Config = InferConfig & {
  cwd: string;
  projects: string[];
  targets?: Target[];
};

export async function resolveProjectPath(
  cwd: string,
  projects: string[]
): Promise<string[]> {
  return glob(projects, { cwd, onlyFiles: false });
}

export interface LoadConfigOptions {
  cwd?: string;
  path?: string;
}

export async function loadConfig({
  cwd = process.cwd(),
  path,
}: LoadConfigOptions): Promise<Config> {
  const mustLoadConfig = !!path;
  const configPath = resolve(cwd, path || "tsc-multi.json");

  debug("Read config from %s", configPath);

  const json = await (() => {
    if (mustLoadConfig) return readJSON(configPath);
    return tryReadJSON(configPath);
  })();

  const result = validate(json, configSchema);

  if (result[0]) {
    throw result[0];
  }

  const config = result[1];

  return {
    ...config,
    cwd,
    projects: await resolveProjectPath(
      dirname(configPath),
      config.projects || []
    ),
  };
}
