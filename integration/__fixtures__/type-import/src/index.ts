import { print } from "./print";

export const x: import("./print").Printable = "Type";
export const inferred = print(x);
// const inferred: import("./print").PrintResult;
