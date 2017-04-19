const Logo = require('./examples/logo')
class LogoWithCanvas {
  constructor() {
    this.state = {
      heading: 0,
      home: {
        x: 0,
        y: 0
      },
      position: {
        x: 0,
        y: 0
      },
      color: [0, 0, 0],
      width: 1,
      isDrawing: true,
      isTurtleShown: true
    }
  }
  
  move(x) {
    this.state.position.x += 
      Math.cos(this.state.heading / 360.0 * 2.0 * Math.PI) * x
    this.state.position.y += 
      Math.sin(this.state.heading / 360.0 * 2.0 * Math.PI) * x
    console.log(this.state);
  }
  
  turn(x) {
    this.state.heading += x
    while (this.state.heading > 360) this.state.heading -= 360
    while (this.state.heading < 0)   this.state.heading += 360
  }
  
  eraseCanvas() {
    console.log('erase canvas');
  }
  
  resetTurtle() {
    this.state.position = this.state.home
    this.state.heading = 0
  }
  
  get heading() {
    return this.state.heading
  }
  set heading(x) {
    this.state.heading = x
    return this.state.heading
  }
  
  get shown() {
    return this.state.isTurtleShown
  }
  set shown(x) {
    this.state.isTurtleShown = x
    return this.state.isTurtleShown
  }
  
  get drawing() {
    return this.state.isDrawing
  }
  set drawing(x) {
    this.state.isDrawing = x
    return this.state.isDrawing
  }
  
  get color() {
    return this.state.color
  }
  set color(x) {
    this.state.color = x
    return this.state.color
  }
  
  get width() {
    return this.state.width
  }
  set width(x) {
    this.state.width = x
    return this.state.width
  }
  
  get x() {
    return this.state.position.x
  }
  set x(x) {
    this.state.position.x = x
    return this.state.position.x
  }
  
  get y() {
    return this.state.position.y
  }
  set y(x) {
    this.state.position.y = x
    return this.state.position.y
  }
}

let canv = new LogoWithCanvas()
let l = new Logo(canv)

// l.execute(`first [1 2 3] for 5+5 [fd 100 rt 91.4 for 2 [right 1 lt 1] for 2 []]`)
// l.execute(`fd 100 - (abs (-100 / 10)) first [first [abs -1] 2 3] last [1 2 3] butfirst [1 2 3] butlast [1 2 3] lastput 1 [0] firstput [] [1] UpperCase "asd lowercase [ASD asd] butlast [teszt elek 99] for 2 [fd 100] if ((10 != 9) and true) [fd arcsin sin 1] [fd -10]`)
// l.execute(`empty? [] empty? " firstput int exp 1 [10] item 1 [1 2 3] first [sqrt 2] repeat 2 [fd 10%4] member? [1 2 3] [[1 2 3] 2 3] word? "asd (print 2 3 4 [1 2 [log10 3]]) print list 1 (list 1 2 3)`)
// l.execute(
// `make "asd 0
// for 10 [make "asd :asd + 1 
//   if :asd == 5 
//     [output :asd] 
//     [wait 1000 print "nope]
// ]`
// ).then(val => { console.log(val) }).catch((e) => { console.error(e.toString()) })

// l.execute(`to asd :e fd :e output :e end to dsa fd 30 end asd 10 20 30 dsa print butlast [teszt elek 99]`).then(val => { console.log(val) }).catch((e) => { console.error(e.toString()) })
// l.execute(`make "asd 10 print run ["local ""asd "1 "output ":asd] print :asd output thing "asd`).then(val => { console.log(val) })
// l.execute(`first [1 2 3] for 5+5 [fd 100 rt 91.4 for 2 [right 1 lt 1] for 2 [] print heading print position] setposition [0 0] setheading 0 print heading print position`)
// l.execute(`print pen pu setpencolor [1 1 10] print pen setpen [true [10 10 1]] print pen setheading towards [100 100] fd sqrt 20000 print position`)

l.execute(`
to előre :e 
  fd :e 
  local "asd 0
  for 10 [make "asd :asd + 1 
    if :asd == 5 
      [output :asd] 
      [wait 100 print :asd]
  ]
end`).then(() => {
  return l.execute(`
    repeat 10 [
      if shown? [hideturtle] [showturtle]
      print előre 10
    ]`)
}).then(val => { console.log(val) }).catch((e) => { console.error(e) })
// setTimeout(() => {
//   l.terminate()
// }, 1651)