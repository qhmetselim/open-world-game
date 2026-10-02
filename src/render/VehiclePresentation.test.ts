import { expect, it } from 'vitest';
import { VehiclePresentation } from './VehiclePresentation';
import { createPlayerState } from '../player/PlayerState';
import { createVehicleState } from '../vehicle/VehicleState';

it('door opens before seating; entry/exit keep endpoints and never mutate gameplay state', () => {
  const player=createPlayerState({x:-3,y:1,z:.3}), car=createVehicleState('v',{x:0,y:.9,z:0},0);
  const snapshot=JSON.stringify([player,car]);
  const entry=new VehiclePresentation(true,player,car);
  expect(entry.side).toBe(-1); expect(entry.sample(car).player.position).toEqual(player.position);
  entry.advance(.6); expect(entry.sample(car).door).toBeGreaterThan(.9); expect(entry.sample(car).seated).toBe(0);
  entry.advance(2); expect(entry.done).toBe(true); expect(entry.sample(car).visible).toBe(false); expect(entry.sample(car).door).toBe(0);
  const exit=new VehiclePresentation(false,player,car); exit.advance(2);
  expect(exit.sample(car).player.position).toEqual(player.position); expect(exit.sample(car).door).toBe(0);
  expect(JSON.stringify([player,car])).toBe(snapshot);
});

it('render timeline is frame-rate independent and bounded for a turning vehicle', () => {
  const player=createPlayerState({x:4,y:1,z:0}), car=createVehicleState('v',{x:0,y:1,z:0},Math.PI/3);
  const a=new VehiclePresentation(true,player,car), b=new VehiclePresentation(true,player,car);
  for(let i=0;i<30;i++)a.advance(1/30);for(let i=0;i<120;i++)b.advance(1/120);
  expect(a.sample(car).player.position.x).toBeCloseTo(b.sample(car).player.position.x,8);
  expect(a.sample(car).seated).toBeCloseTo(b.sample(car).seated,8);
});

it('front approach reaches the side before moving past the hood', () => {
  const player=createPlayerState({x:0,y:1,z:3}), car=createVehicleState('v',{x:0,y:1,z:0},0);
  const entry=new VehiclePresentation(true,player,car);
  for(let i=0;i<28;i++) {
    entry.advance(.01);
    const point=entry.sample(car).player.position;
    expect(Math.abs(point.x)>=1.27 || point.z>=2.2).toBe(true);
  }
});
