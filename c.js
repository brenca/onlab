const C = require('./lang/preproc');
const Clang = C.fromBNF()

Clang.execute(`

  #include <stdio.h>

`)
