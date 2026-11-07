// Retain normal GPU detail; reduce only the framebuffer cost of CPU rasterizers.
export function homefrontPixelRatio(deviceRatio,coarse=false,rendererName=''){
 const ratio=Number.isFinite(deviceRatio)&&deviceRatio>0?deviceRatio:1;
 const software=/swiftshader|llvmpipe|softpipe|software rasterizer/i.test(rendererName);
 return Math.min(ratio,coarse?1.15:1.6,software?0.75:Infinity);
}

export function homefrontRendererName(renderer){
 try{
  const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER)||'');
 }catch{return '';}
}
