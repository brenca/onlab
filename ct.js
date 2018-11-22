const C = require('./lang/threadc')
const CLang = new C()

CLang.on('ready', async () => {
  await CLang.execute(`

  typedef int myint, integer;

  void main(int x) {
    integer z;
    for(z = 0; z < 10; z++) {
      printf(z, 2.2);
    }
    return z;
  }

  `)

  CLang.end()
})
