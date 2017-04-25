const { remote } = require('electron')
// const Logo = remote.require('./lib/logo')
const Logo = require('../lib/logo')
const logo = new Logo()
window.logo = logo

// logo.on('move', (from, to) => {
//   console.log('move', from, to)
// })
// 
// logo.on('turn', (heading) => {
//   console.log('turn', heading)
// })
// 
// logo.on('erase', () => {
//   console.log('erase')
// })

logo.on('print', (what) => {
  console.log('print', what)
})

document.addEventListener('DOMContentLoaded', () => {
  const editor = window.ace.edit('editor')
  editor.setTheme('ace/theme/xcode')
  editor.getSession().setMode("ace/mode/logo")
  editor.heatmap = []
  const Range = window.ace.require("ace/range").Range
  
  let addToHeatmap = (newheat) => {
    if (editor.heatmap.length === 1) {
      let heat = editor.heatmap.shift()
      setTimeout(() => {
        if (heat) editor.session.removeMarker(heat)
      }, 50)
    }
    editor.heatmap.push(newheat)
  }
  
  let resetHeatmap = () => {
    editor.heatmap.forEach(heat => {
      editor.session.removeMarker(heat)
    })
    editor.heatmap = []
  }
  
  let canvas = document.getElementById("canvas")
  let context = canvas.getContext("2d")
  context.beginPath()
  
  logo.setHome({
    x: 250,
    y: 250
  })
  
  logo.on('move', (from, to) => {
    context.moveTo(from.x, from.y)
    context.lineTo(to.x, to.y)
    // context.stroke()
  })
  
  let draw = () => {
    context.stroke()
    context.beginPath()
    window.requestAnimationFrame(draw)
  }
  draw()
  
  logo.on('erase', () => {
    context.clearRect(0, 0, canvas.width, canvas.height)
  })
  
  logo.on('executing', (pos) => {
    addToHeatmap(editor.session.addMarker(
      new Range(
        pos.line,
        pos.char,
        pos.line,
        pos.char + pos.length - 1
      ),
      "logo-running", 
      "text"
    ))
  })
  
  editor.resetErrors = function() {
    if (this.session._errorMarker) 
      this.session.removeMarker(this.session._errorMarker)
    resetHeatmap()
    this.getSession().setAnnotations([])
  }
  
  editor.getSession().on('change', () => {
    editor.resetErrors()
  })
  
  editor.commands.addCommand({
    name: 'Run',
    bindKey: {win: 'Ctrl-X',  mac: 'Command-X'},
    exec: async (editor) => {
      logo.terminate()
      try {
        editor.resetErrors()
        await logo.execute(editor.getValue())
      } catch (e) {
        if (e.position) {
          editor.getSession().setAnnotations([{
            row: e.position.line,
            column: e.position.char,
            text: e.message,
            type: 'error'
          }])
          
          editor.session._errorMarker = editor.session.addMarker(
            new Range(
              e.position.line,
              e.position.char,
              e.position.line,
              e.position.char + e.position.length - 1
            ),
            "logo-error", 
            "text"
          )
        }
      }
    },
    readOnly: true
  })
  
  // document.getElementById('run').addEventListener('click', () => {
  //   logo.terminate()
  //   logo.execute(editor.getValue())
  // })
  // logo.execute(`
  //   make "asd 10 
  //   print run [
  //     "local ""asd "1 "to "fos "fd -210 "end "fos "output ":asd
  //   ]
  // `).then(() => {
  //   return logo.execute(`fd 10 print :asd output thing "asd`, true)
  // }).then(val => { console.log(val) }).catch((e) => { console.error(e) })
})

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

// logo.execute(`
// to előre :e 
//   fd :e 
//   local "asd 0
//   for 10 [make "asd :asd + 1 
//     if :asd == 5 
//       [output :asd] 
//       [wait 100 print :asd]
//   ]
// end`).then(() => {
//   console.log(logo._procedures)
//   return logo.execute(`
//     repeat 10 [
//       if shown? [hideturtle] [showturtle]
//       print előre 10
//     ]`)
// }).then(val => { console.log(val) }).catch((e) => { console.error(e) })
// setTimeout(() => {
//   l.terminate()
// }, 1651)