"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = print;
var out_1 = require("./print/out.cjs");
function print(name) {
    (0, out_1.default)("Hello ".concat(name));
}
