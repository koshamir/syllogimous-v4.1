const deco = () => (t) => t;
const propDeco = () => () => {};
module.exports = { Injectable: deco, Component: deco, Input: propDeco, Output: propDeco, NgModule: deco, Directive: deco, Pipe: deco, EventEmitter: class {} };
