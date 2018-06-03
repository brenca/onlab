const C = require('./lang/c')
const Clang = C.fromBNF()

Clang.execute(`what(2125764 == 1 * (9 - 2 - 3) * 3 ^ ((-4 + -2) * -2) 11 * 2.2)`)
