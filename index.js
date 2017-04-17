// const BasicMath = require('./examples/math')
// global.BasicMath = BasicMath
// console.log(
//   BasicMath.execute(`10 ^ ((10 - 5 + 4) / (6 - 3)), 10 22/10
//   
//   
//   
//   432.432/10`)
// )

const Logo = require('./examples/logo')
global.Logo = Logo
let l = new Logo((c, a) => {
  console.log(c, a)
})
// l.execute(`first [1 2 3] for 5+5 [fd 100 rt 91.4 for 2 [right 1 lt 1] for 2 []]`)
l.execute(`first [1 2 3] last [1 2 3] butfirst [1 2 3] butlast [1 2 3] putlast 1 [0] putfirst [0] [1] first "asd butlast [teszt elek]`)