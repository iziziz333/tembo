// The notification-area icon: Tembo keeps living there when its window is
// closed, and the menu reaches the main actions without opening it.

const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let tray = null;

function icon() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  img.addRepresentation({ scaleFactor: 2, buffer: nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray@2x.png')).toPNG() });
  return img;
}

const startsWithWindows = () => app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;

// actions: { show, openFolder(which), arrange, quit }
function create(actions) {
  tray = new Tray(icon());
  tray.setToolTip('Tembo');
  tray.on('click', actions.show);
  const rebuild = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть Tembo', click: actions.show },
    { type: 'separator' },
    { label: 'Разобрать «Загрузки»', click: () => actions.openFolder('downloads') },
    { label: 'Разобрать рабочий стол', click: () => actions.openFolder('desktop') },
    { label: 'Расставить значки на рабочем столе', click: actions.arrange, visible: process.platform === 'win32' },
    { type: 'separator' },
    {
      label: 'Запускать вместе с Windows',
      type: 'checkbox',
      checked: startsWithWindows(),
      click: item => {
        app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] });
        rebuild();
      },
    },
    { type: 'separator' },
    { label: 'Выход', click: actions.quit },
  ]));
  rebuild();
  return tray;
}

// Said once, the first time the window goes to the tray instead of closing.
function hint(text) {
  if (tray && process.platform === 'win32') tray.displayBalloon({ title: 'Tembo работает в трее', content: text, iconType: 'info' });
}

module.exports = { create, hint };
