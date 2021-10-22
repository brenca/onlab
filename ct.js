const C = require('./lang/threadc')
const CLang = new C()

CLang.on('ready', async () => {
  await CLang.execute(`

    typedef int myint, integer;
    typedef stuff;

    void main(int x) {
      myint z;
      for(z = 0; z < 10; z++) {
        printf(z, 2.2);
      }
      return z;
    }

  `)

  CLang.end()
})
