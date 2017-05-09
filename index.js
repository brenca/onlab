const { app, BrowserWindow } = require('electron')
const url = require('url')
const path = require('path')

app.on('browser-window-created', (e, window) => {
  window.setMenu(null)
})
  
app.on('ready', () => {
  let win = new BrowserWindow({
    title: 'Logo.js',
    disableAutoHideCursor: true,
    show: false,
    width: 1000, 
    height: 550,
    minWidth: 800,
    minHeight: 550,
    useContentSize: true,
    webPreferences: {
      experimentalFeatures: true
    }
  })
  
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'static', 'index.html'),
    protocol: 'file:',
    slashes: true
  }))
  
  win.on('ready-to-show', () => {
    win.show()
  })
  
  // win.webContents.on('dom-ready', () => {
  //   win.webContents.openDevTools({ detach: true })
  // })
})

app.on('window-all-closed', function () {
  app.quit()
})