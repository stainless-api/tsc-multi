export type Printable = string;
export interface PrintResult {
  uwu: 1;
}
export function print(name: Printable): PrintResult {
  console.log(`Hello ${name}`);
  return {
    uwu: 1,
  };
}
