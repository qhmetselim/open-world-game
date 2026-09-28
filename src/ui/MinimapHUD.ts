import { mapHeading,mapPoint,mapRoadPath,minimapConfig,relativeMapHeading } from './MinimapModel';
import type { MinimapSnapshot } from './MinimapModel';

const ns='http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag:K,attributes:Record<string,string>={}) {
  const element=document.createElementNS(ns,tag);
  for(const [key,value] of Object.entries(attributes))element.setAttribute(key,value);
  return element;
}
/** Small non-interactive DOM/SVG overlay, no scene objects, textures or simulation ownership. */
export class MinimapHUD {
  private readonly root=document.createElement('aside');
  private readonly caption=document.createElement('div');
  private readonly map=svg('svg',{viewBox:'0 0 200 200','aria-hidden':'true'});
  private readonly roads=svg('path',{class:'minimap-roads'});
  private readonly search=svg('circle',{class:'minimap-search-area'});
  private readonly markers=svg('g');
  private readonly player=svg('path',{d:'M0,-7L5,6L0,3L-5,6Z',class:'minimap-player'});
  private elapsed=Infinity;
  public constructor(host:HTMLElement) {
    this.root.className='minimap-hud';this.root.setAttribute('aria-label','Minimap');
    this.caption.className='minimap-caption';
    const scale=svg('path',{d:`M10,183v5h${100*minimapConfig.size/(2*minimapConfig.radius)}v-5`,class:'minimap-direction'});
    this.map.append(this.roads,this.search,this.markers,this.player,scale);this.root.append(this.map,this.caption);host.append(this.root);
  }
  public update(dt:number,snapshot:MinimapSnapshot):void {
    this.elapsed+=dt;if(this.elapsed<minimapConfig.refreshSeconds)return;this.elapsed=0;
    const heading=mapHeading(snapshot.forward);
    this.roads.setAttribute('d',mapRoadPath(snapshot.lines,snapshot.position,heading));
    this.player.setAttribute('transform',`translate(100 100) rotate(${relativeMapHeading(snapshot.cameraForward,snapshot.forward)})`);
    this.root.dataset.mode=snapshot.wanted?(snapshot.searching?'search':'chase'):'normal';
    this.caption.textContent=`BODY ↑ · 100 m${snapshot.wanted?` · ${snapshot.searching?'SEARCH':'CHASE'}`:''}`;
    this.root.setAttribute('aria-label',`Minimap · ${snapshot.lines.length} nearby lane paths · ${snapshot.wanted?snapshot.police.length:0} police · ${snapshot.wanted?(snapshot.searching?'SEARCH':'CHASE'):'normal'}`);
    this.search.style.display=snapshot.wanted&&snapshot.searching?'':'none';
    const last=mapPoint(snapshot.lastKnown,snapshot.position,minimapConfig.radius,heading);
    this.search.setAttribute('cx',String(last.x));this.search.setAttribute('cy',String(last.y));
    this.search.setAttribute('r',String(minimapConfig.searchRadius*minimapConfig.size/(2*minimapConfig.radius)));
    this.markers.replaceChildren();
    if(snapshot.wanted)for(const marker of snapshot.police) {
      const point=mapPoint(marker.position,snapshot.position,minimapConfig.radius,heading);
      if(point.x<0||point.x>200||point.y<0||point.y>200)continue;
      const group=svg('g',{transform:`translate(${point.x} ${point.y}) rotate(${relativeMapHeading(marker.forward,snapshot.forward)})`,class:`minimap-unit ${marker.mode}`});
      if(marker.mode==='search')group.append(svg('path',{d:'M0,0L-12,-23Q0,-29 12,-23Z',class:'minimap-cone'}));
      group.append(marker.kind==='car'?svg('rect',{x:'-3',y:'-5',width:'6',height:'10',rx:'1'}):svg('circle',{r:'3'}));
      group.append(svg('path',{d:'M0,-5L0,-9',class:'minimap-direction'}));this.markers.append(group);
    }
  }
  public dispose():void{this.root.remove();}
}
