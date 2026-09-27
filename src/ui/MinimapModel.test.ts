import { expect,it } from 'vitest';
import { mapPoint,mapHeading,mapRoadPath } from './MinimapModel';

it('minimap stays world-relative at negative coordinates and displays heading consistently',()=>{
  const center={x:-512,z:-1024};
  expect(mapPoint(center,center)).toEqual({x:100,y:100});
  expect(mapPoint({x:-362,z:-1174},center)).toEqual({x:200,y:0});
  expect(mapHeading({x:0,z:-1})).toBe(0);
  expect(mapHeading({x:1,z:0})).toBe(90);
  expect(mapHeading({x:-1,z:0})).toBe(-90);
});

it('minimap uses supplied road polylines, retaining cross-boundary paths and rejecting distant roads',()=>{
  const lines=[{id:'crossing',path:[{x:-200,z:0},{x:200,z:0}]},{id:'distant',path:[{x:500,z:500},{x:600,z:600}]}];
  expect(mapRoadPath(lines,{x:0,z:0})).toBe('M-33.3,100.0L233.3,100.0');
  expect(mapRoadPath(lines,{x:1000,z:1000})).toBe('');
});
