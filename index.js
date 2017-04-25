const { app, BrowserWindow } = require('electron')
const Logo = new (require('./lib/logo'))()
const url = require('url')
const path = require('path')

app.on('ready', () => {
  let win = new BrowserWindow({
    width: 1000, 
    height: 500,
    useContentSize: true
  })
  
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'static', 'index.html'),
    protocol: 'file:',
    slashes: true
  }))
  
  win.webContents.on('dom-ready', () => {
    win.webContents.openDevTools({ detach: true })
  })
})

app.on('window-all-closed', function () {
  app.quit()
})