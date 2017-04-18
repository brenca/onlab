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
// l.execute(`fd 100 - (abs (-100 / 10)) first [first [abs -1] 2 3] last [1 2 3] butfirst [1 2 3] butlast [1 2 3] putlast 1 [0] putfirst [] [1] UpperCase "asd lowercase [ASD asd] butlast [teszt elek 99] for 2 [fd 100] if 10 != 9 [fd arcsin sin 1] [fd -10]`)
l.execute(`empty? [] empty? " firstput int exp 1 [10] item 1 [1 2 3] first (list log10 15 2 3 4 5) fd 3`)


/*
heading
hideturtle
showturtle
home
list?
make
member?
number?
output
pen
pendown
penup
penwidth
pi
position
power
print
random
remainder -> %
repeat -> for
round
run
sentence
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
sqrt
stop
thing
time
date
towards
wait
word
word?
xpos
ypos


*/