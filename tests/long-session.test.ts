import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World} from '../src/world.ts';
import {newGame} from '../src/model.ts';
import {FishingView,type PondView} from '../src/fishing-view.ts';
import {FISH_PER_WATER} from '../src/fishing.ts';
import {buildFriend,disposeFriend,setFriendDresser} from '../src/friend-view.ts';

// Long play sessions (the soak test): what a world, a pond or a friend drops from the scene must be freed, and nothing
// may pile up with play. Real Three objects; only WebGL is omitted (as in world.test.ts).
function world() {
  return Object.assign(Object.create(World.prototype), {
    state:newGame(),scene:new T.Scene(),camera:new T.PerspectiveCamera(40,4/3,.5,300),
    root:new T.Group(),player:new T.Group(),companion:new T.Group(),position:new T.Vector3(),
    destination:null,route:[],selected:null,obstacles:[],entities:[],enemies:[],plotMeshes:[],cropSignatures:[],
    particles:[],keys:new Set<string>(),facing:0,time:0,planet:'home',hazardTimer:0,
    marker:new T.Mesh(),ring:new T.Mesh(),cameraTarget:new T.Vector3(),sun:new T.DirectionalLight(),raycaster:new T.Raycaster(),
    onInteract(){},onAttackEnemy(){},onDamage(){},onZone(){},
  }) as World;
}
/** Every geometry, material and texture seen in `root`, and how many of them are still undisposed. */
function tracker() {
  const seen=new Set<T.EventDispatcher<{dispose:object}>>(),freed=new Set<unknown>();
  const watch=(r:T.EventDispatcher<{dispose:object}>)=>{if(seen.has(r))return;seen.add(r);r.addEventListener('dispose',()=>freed.add(r));};
  return {
    note(root:T.Object3D){root.traverse(o=>{const m=o as T.Mesh;if(m.geometry)watch(m.geometry);for(const mat of [m.material??[]].flat()){watch(mat);for(const v of Object.values(mat))if(v instanceof T.Texture)watch(v);}});},
    live(){return [...seen].filter(r=>!freed.has(r)).length;},
    freed:(r:unknown)=>freed.has(r),
  };
}

test('travelling round every world again and again holds no more GPU resources than the first trip',()=>{
  const w=world(),t=tracker(),trip=['home','lava','toy','candy','cloud','shadow','ocean','jungle','ice','home'] as const,live:number[]=[];
  for(let i=0;i<3;i++){for(const planet of trip){w.build(planet);t.note(w.scene);}live.push(t.live());}
  assert.equal(live[1],live[0]);assert.equal(live[2],live[0]);
});

test('the toy world checker floor is freed with the world',()=>{
  const w=world();w.build('toy');
  const ground=w.root.getObjectByName('ground')!,map=((ground.children[0] as T.Mesh).material as T.MeshToonMaterial).map;
  assert.ok(map);let freed=false;map.addEventListener('dispose',()=>{freed=true;});
  w.build('home');assert.ok(freed);
});

const POND:PondView={id:'home',x:0,z:0,rx:4,rz:4,surface:0,waterId:'home'};
const FX={ring(){},burst(){},shake(){},flash(){},spark(){}};
function cast(view:FishingView,land:boolean,clock:number){
  view.begin(POND,new T.Vector3(0,1,5),{x:1,z:1});view.approachDistance('fish_perch');
  if(land)view.land(()=>new T.Vector3(0,0,5),()=>{});else view.cancel();
  // Long enough for the leap, a fleeing fish to calm down and the catch to be restocked.
  for(let k=0;k<30;k++)view.update(.5,clock+k*.5,new T.Vector3(),new T.Vector3(0,0,5),null);
}

test('a pond keeps its own count of fish however many casts bring a new one in from the rim',()=>{
  const scene=new T.Scene(),view=new FishingView(scene,FX as never,{ready:false} as never,()=>{}),t=tracker();
  view.populate([POND],()=>['fish_perch']);assert.equal(view.swimming,FISH_PER_WATER.home);
  t.note(scene);const before=t.live();
  for(let i=0;i<120;i++){cast(view,i%2===1,i*15);t.note(scene);}
  assert.equal(view.swimming,FISH_PER_WATER.home);
  // Caught fish and rim visitors are freed once they leave: only the pond's own fish (and the line and bobber) remain.
  assert.equal(t.live(),before);
});

test('a mystery shadow is freed when it is caught or hidden by the server cooldown',()=>{
  let now=1000;const scene=new T.Scene(),view=new FishingView(scene,FX as never,{ready:false} as never,()=>{},()=>now),t=tracker();
  view.populate([POND],()=>['fish_perch']);
  const internals=view as unknown as {fish:Array<{mystery?:boolean;obj:T.Object3D}>;addMystery:(pond:PondView)=>void;symbolTextures:Map<string,T.Texture>};
  internals.symbolTextures.set('?',new T.Texture()); // the cached question-mark card (a canvas in the browser), shared by every shadow
  internals.addMystery(POND);const shadow=internals.fish.find(f=>f.mystery)!.obj;t.note(shadow);assert.ok(t.live()>0);
  view.setMysteryAvailability(POND.id,60);
  assert.equal(shadow.parent,null);assert.equal(t.live(),1,'only the shared question-mark card stays');
});

test('a friend model dropped from the scene is freed through the world, kit pieces aside',()=>{
  const friend=buildFriend('sprout',{}),scene=new T.Scene(),t=tracker();scene.add(friend);t.note(friend);
  const freed:T.Object3D[]=[];setFriendDresser(null,model=>{freed.push(model);});
  try{disposeFriend(friend);}finally{setFriendDresser(null);}
  assert.equal(friend.parent,null);assert.deepEqual(freed,[friend]);
  // Without a world (no dresser registered) its own geometry still goes.
  const other=buildFriend('sprout',{}),t2=tracker();t2.note(other);disposeFriend(other);
  other.traverse(o=>{const m=o as T.Mesh;if(m.geometry&&!m.geometry.userData.sharedKit)assert.ok(t2.freed(m.geometry));});
});

test('a rebuilt world lets go of the old one: the kept eye glints leave the old root',()=>{
  const w=world() as World&{darknessActive?:()=>boolean;eyeGlints:()=>unknown[];updateEyeGlints:()=>void;eyeMesh?:T.InstancedMesh};
  w.build('shadow');const old=w.root;
  w.darknessActive=()=>true;w.eyeGlints=()=>[{creature:w.enemies[0],x:0,y:1,z:0}];w.updateEyeGlints();
  assert.equal(w.eyeMesh?.parent,old);
  w.build('home');
  assert.equal(w.eyeMesh?.parent,null,'the glints would keep the whole old world reachable');
});
