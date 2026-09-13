import type { PhysicsWorld } from './PhysicsWorld';
import type { Interactable, InteractionConfig } from '../interaction/InteractionState';
import { doorTransform, localInteractionPoint } from '../interaction/InteractionState';
import { vestibuleBoxes } from '../interaction/InteractionGeometry';

export class InteractionPhysics {
  public readonly body: ReturnType<PhysicsWorld['createStaticBox']>;
  private readonly frame: ReturnType<PhysicsWorld['createStaticBox']>[] = [];
  public constructor(private readonly physics: PhysicsWorld, private readonly item: Interactable, private readonly config: InteractionConfig, amount: number) {
    if (item.type === 'door') {
      const transform = doorTransform(item, amount, config);
      this.body = physics.createStaticCuboid([transform.position.x, transform.position.y, transform.position.z], this.halfExtents, transform.yaw);
      for (const box of vestibuleBoxes(config)) {
        const point = localInteractionPoint(item, box.x, box.y, box.z);
        this.frame.push(physics.createStaticCuboid([point.x, point.y, point.z], [box.width / 2, box.height / 2, box.depth / 2], item.yaw));
      }
    } else this.body = physics.createStaticBox([item.position.x, item.position.y + .55, item.position.z], [.18, .55, .18]);
  }
  private get halfExtents(): readonly [number, number, number] { return [this.config.doorWidth / 2, this.config.doorHeight / 2, this.config.doorThickness / 2]; }
  public canMove(amount: number): boolean {
    const target = doorTransform(this.item, amount, this.config);
    return this.physics.isDoorMotionClear(target.position, target.yaw, this.halfExtents);
  }
  public move(amount: number): void {
    const transform = doorTransform(this.item, amount, this.config);
    this.body.setTranslation(transform.position, false);
    this.body.setRotation({ x: 0, y: Math.sin(transform.yaw / 2), z: 0, w: Math.cos(transform.yaw / 2) }, false);
  }
  public dispose(): void {
    for (const body of this.frame) this.physics.removeRigidBody(body);
    this.physics.removeRigidBody(this.body);
  }
}
