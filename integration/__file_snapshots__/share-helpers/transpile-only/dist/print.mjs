import { __generator, __values } from "./helpers.mjs";
function greet(names) {
    var names_1, names_1_1, name, e_1_1;
    var e_1, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 5, 6, 7]);
                names_1 = __values(names), names_1_1 = names_1.next();
                _b.label = 1;
            case 1:
                if (!!names_1_1.done) return [3 /*break*/, 4];
                name = names_1_1.value;
                return [4 /*yield*/, "Hello ".concat(name)];
            case 2:
                _b.sent();
                _b.label = 3;
            case 3:
                names_1_1 = names_1.next();
                return [3 /*break*/, 1];
            case 4: return [3 /*break*/, 7];
            case 5:
                e_1_1 = _b.sent();
                e_1 = { error: e_1_1 };
                return [3 /*break*/, 7];
            case 6:
                try {
                    if (names_1_1 && !names_1_1.done && (_a = names_1.return)) _a.call(names_1);
                }
                finally { if (e_1) throw e_1.error; }
                return [7 /*endfinally*/];
            case 7: return [2 /*return*/];
        }
    });
}
export default function printAll(names) {
    var e_2, _a;
    try {
        for (var _b = __values(greet(names)), _c = _b.next(); !_c.done; _c = _b.next()) {
            var line = _c.value;
            console.log(line);
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_2) throw e_2.error; }
    }
}
