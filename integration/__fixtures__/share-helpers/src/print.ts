// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { __addDisposableResource } from "tslib";

function* greet(names: Iterable<string>) {
  for (const name of names) {
    yield `Hello ${name}`;
  }
}
export default function printAll(names: Iterable<string>): void {
  for (const line of greet(names)) {
    console.log(line);
  }
}
