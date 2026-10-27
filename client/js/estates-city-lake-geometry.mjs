// Shared geometry for a city-side Estates island proxy. Coordinates are local:
// x runs across the lake and z points from the city toward the island.
// This module does not place meshes or grant access to the island instance.
export function createEstatesCityLakeGeometry({islandX=0,islandZ=0,islandRadiusX=95,islandRadiusZ=70,waterWidth=45}={}) {
  if (![islandX,islandZ,islandRadiusX,islandRadiusZ,waterWidth].every(Number.isFinite) || islandRadiusX<=0 || islandRadiusZ<=0 || waterWidth<=0) throw new TypeError('invalid Estates lake geometry');
  const rx=islandRadiusX, rz=islandRadiusZ, outerX=rx+waterWidth, outerZ=rz+waterWidth;
  const normalized=(x,z,a,b)=>((x-islandX)/a)**2+((z-islandZ)/b)**2;
  const valid=(x,z)=>Number.isFinite(x)&&Number.isFinite(z);
  return Object.freeze({
    islandX,islandZ,islandRadiusX:rx,islandRadiusZ:rz,outerX,outerZ,
    isIsland(x,z){return valid(x,z)&&normalized(x,z,rx,rz)<=1;},
    isWater(x,z){return valid(x,z)&&normalized(x,z,rx,rz)>1&&normalized(x,z,outerX,outerZ)<=1;},
    // The city-side representation is not a destination: entry is a transition.
    mayEnterProxy(){return false;}
  });
}
