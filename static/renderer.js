const { dialog } = require('electron').remote
const fs = require('fs-extra')
const Logo = require('../lib/logo')
const logo = new Logo()
window.logo = logo

let exec = async (editor) => {
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
}

let open = (editor) => {
  let file = dialog.showOpenDialog({
    title: 'Open a file',
    filters: [{ name: 'Logo.js files', extensions: ['logo'] }],
    properties: ['openFile']
  })
  
  if (file !== undefined) {
    fs.readFile(file[0], 'utf8', (err, data) => {
      if (err) throw err
      editor.setValue(data)
      editor.clearSelection()
    })
  }
}

let save = (editor) => {
  let file = dialog.showSaveDialog({
    title: 'Save to a file',
    filters: [{ name: 'Logo.js files', extensions: ['logo'] }]
  })
  
  if (file !== undefined) {
    fs.writeFile(file, editor.getValue(), 'utf8', err => {
      if (err) throw err
    })
  }
}

logo.on('print', (what) => {
  let console = document.querySelector('.console .out')
  let time = new Date().toTimeString().replace(/.*(\d{2}:\d{2}):\d{2}.*/, '$1')
  console.innerHTML += `[${time}]&nbsp;>&nbsp;${what} <br>`
  let consoleWrapper = document.querySelector('.console .console-wrapper')
  consoleWrapper.scrollTop = consoleWrapper.scrollHeight
})

document.addEventListener('DOMContentLoaded', () => {
  const editor = window.ace.edit('editor')
  editor.setTheme('ace/theme/xcode')
  editor.getSession().setMode("ace/mode/logo")
  editor.heatmap = []
  const Range = window.ace.require("ace/range").Range
  
  document.querySelector('#delay').addEventListener('input', e => {
    logo.delay = e.target.value
  })
  
  logo.on('execution-started', () => {
    document.querySelector('#playpause').classList.remove('glyphicon-play')
    document.querySelector('#playpause').classList.add('glyphicon-pause')
    document.querySelector('#stop').classList.remove('disabled')
  })
  
  logo.on('execution-paused', () => {
    document.querySelector('#playpause').classList.remove('glyphicon-pause')
    document.querySelector('#playpause').classList.add('glyphicon-play')
  })
  
  logo.on('execution-resumed', () => {
    document.querySelector('#playpause').classList.remove('glyphicon-play')
    document.querySelector('#playpause').classList.add('glyphicon-pause')
  })
  
  logo.on('execution-stopped', () => {
    document.querySelector('#playpause').classList.remove('glyphicon-pause')
    document.querySelector('#playpause').classList.add('glyphicon-play')
    document.querySelector('#stop').classList.add('disabled')
  })
  
  document.querySelector('#playpause').addEventListener('click', e => {
    if (e.target.classList.contains('glyphicon-pause')) {
      logo.pause()
    } else if (!logo.executing) {
      exec(editor)
    } else {
      logo.resume()
    }
  })
  
  document.querySelector('#stop').addEventListener('click', e => {
    logo.terminate()
  })
  
  document.querySelector('#open').addEventListener('click', e => {
    open(editor)
  })
  
  document.querySelector('#save').addEventListener('click', e => {
    save(editor)
  })
  
  document.querySelector('#console').addEventListener('keyup', e => {
    if (e.keyCode == 13) {
      logo.execute(e.target.value)
      e.target.value = ''
    }
  })
  
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
  
  let moveTurtle = (x, y) => {
    let turtle = document.querySelector('#turtle')
    turtle.style.left = x + 'px'
    turtle.style.top = y + 'px'
  }
  
  let rotateTurtle = (deg) => {
    document.querySelector('#turtle').style.transform = `rotate(${deg}deg)`
  }
  
  let canvas = document.getElementById("canvas")
  let context = canvas.getContext("2d")
  context.beginPath()
  
  logo.setHome({
    x: 200,
    y: 200
  })
  
  moveTurtle(200, 200)
  
  logo.on('move', (from, to) => {
    context.moveTo(from.x, from.y)
    context.lineTo(to.x, to.y)
    moveTurtle(to.x, to.y)
  })
  
  logo.on('turn', deg => {
    rotateTurtle(deg)
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
    bindKey: {win: 'Ctrl-Y',  mac: 'Command-Y'},
    exec,
    readOnly: true
  })
  
  editor.commands.addCommand({
    name: 'Save',
    bindKey: {win: 'Ctrl-S',  mac: 'Command-S'},
    exec: save
  })
  
  editor.commands.addCommand({
    name: 'Open',
    bindKey: {win: 'Ctrl-O',  mac: 'Command-O'},
    exec: open
  })
})