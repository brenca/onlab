const C = require('./lang/c2')
const Clang = C.fromBNF()
// const Clang = C.fromSave()

// Clang.execute(`1 * (9 - 2 - 3) * 3 ^ ((-4 + -2) * -2)`)
// Clang.execute(`2+2`)
// Clang.execute(`void what(a, b, c) {
//   what(a, b, c + 1);
//   int x = 10;
//   float y;
//   while (x < 20) {
//     printf(x);
//   }
//   for(int i = 1; i < 10; i=i+1) {
//     printf("asd");
//   }
// }`)

// Clang.execute(`f = f * f + f * f`)
// Clang.execute(`ac`)

// Clang.execute(`if ( 1.2 ) if ( 1.3 ) 1.4 else 1.5`)
// Clang.execute(`int i;`)
Clang.execute(`void main(int x) {
  int z;
  for(z = 0; z < 10; z++) {
    printf(z);
  }
  return z;
}`)
