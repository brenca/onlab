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

console.log('loaded');

// l.execute(`first [1 2 3] for 5+5 [fd 100 rt 91.4 for 2 [right 1 lt 1] for 2 []]`)
// l.execute(`fd 100 - (abs (-100 / 10)) first [first [abs -1] 2 3] last [1 2 3] butfirst [1 2 3] butlast [1 2 3] lastput 1 [0] firstput [] [1] UpperCase "asd lowercase [ASD asd] butlast [teszt elek 99] for 2 [fd 100] if ((10 != 9) and true) [fd arcsin sin 1] [fd -10]`)
// l.execute(`empty? [] empty? " firstput int exp 1 [10] item 1 [1 2 3] first [sqrt 2] repeat 2 [fd 10%4] member? [1 2 3] [[1 2 3] 2 3] word? "asd (print 2 3 4 [1 2 [log10 3]]) print list 1 (list 1 2 3)`)
l.execute(`make "asd 0 for 10 [make "asd :asd + 1 if :asd == 5 [output :asd] [wait 1000 print "nope]] make "asd 10 print run ["local ""asd "1 "output ":asd] print :asd output thing "asd`).then(val => { console.log(val) })

/*
heading
hideturtle
showturtle
home
pen
pendown
penup
penwidth
position
setbg
setheading
setlinedash
setpen
setpencolor
setpenwidth
setposition
setx
sety
shown?
snap
towards
xpos
ypos


*/