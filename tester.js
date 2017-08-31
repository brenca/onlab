const Test = require('./lib/test')
const test = new Test()

// test.execute(`
//   to asd :h
//     print -:h
//   end
// `)

/*

to előre :e :h
    fd :e 
    local "asd 0
    to dsa
      output 30
    end
    for 10 [make "asd :asd + 1 
    if :asd == 5 
        [output :asd] 
        [wait 100 print :asd]
    ]
end
make "f [1 1]
print fibonacci 10
to fibonacci :n
    if (count :f) + 1 > :n [output (item :n :f)]
    local "x (fibonacci :n - 1)
    local "y (fibonacci :n - 2)
    // print (:x / :y)
    make "f (lastput (:x + :y) :f)
    output (:x + :y)
end

// make "z 1
// repeat 4 [print fibonacci :z make "z :z + 1]
// print :f
// előre előre 10 10 10
// print fibonacci fibonacci 2
repeat 360 [fd 1 rt 1]

*/

// test.execute(`rc xycccd rcc xyccf`)
// test.execute('rccc xycd')
// test.execute(`r2 xyd`)

// test.execute(`output 1 + 1 + 2 * 3`)
// test.execute(`a`)
test.execute(`xbahbah`)
test.execute(`xc`)
test.execute(`xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`)
// test.execute(``)
// test.execute(`b`)
// test.execute(`x`)
// test.execute(`cx`)
// test.execute(`xx`)
// test.execute(`xxx`)
// test.execute(`xxxx`)
// test.execute(`xxxxx`)
// test.execute(`xxxxxx`)
// test.execute(`xxxxxxx`)
// test.execute(`xxxxxxxx`)
// test.execute(`xxxxxxxxx`)
// test.execute(`xxxxxxxxxx`)
// test.execute(`xxxxxxxxxxx`)
// test.execute(`xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
