declare module "yaml" {
  export function parse(source: string): any;
  const YAML: {
    parse: typeof parse;
  };
  export default YAML;
}
