const Test = require('./lib/test')
const test = new Test()

test.execute(`3*4/2*4`)

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

// test.execute(`xbahbah`)
// test.execute(`x`)
// test.execute(`xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`)

// test.execute(`a`)
// test.execute(`ab`)
// test.execute(`abba`)

// const profiler = require('@risingstack/v8-profiler')
// const fs = require('fs')
// profiler.startProfiling('profile', true)

// test.execute(`bb`)

// let profile = profiler.stopProfiling()
// profile.export(function(error, result) {
//   fs.writeFileSync('profile.cpuprofile', result)
//   profile.delete();
// })

// test.execute(`1 + 2 + 3 * 4 + 2`)
// test.execute(`1 * 9 - 2 - 3 * 3 ^ -4 + -2`)
// test.execute(`1 * (9 - 2 - 3) * 3 ^ (-4 + -2)`)
// test.execute(`- 1 - + 1`)
// test.execute(`-22 / -4.4`)

// test.execute(`1+1+1+1+1+1+1+1`)

// test.execute(``)
// test.execute(`bb`)
// test.execute(`xxbah`)
// test.execute(`abcd`)
// test.execute(`a`)
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
