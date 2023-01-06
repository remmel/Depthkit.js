(function(h,p){typeof exports=="object"&&typeof module<"u"?p(exports,require("three")):typeof define=="function"&&define.amd?define(["exports","three"],p):(h=typeof globalThis<"u"?globalThis:h||self,p(h.dephkit={},h.THREE))})(this,function(h,p){"use strict";function m(d){const e=Object.create(null,{[Symbol.toStringTag]:{value:"Module"}});if(d){for(const a in d)if(a!=="default"){const l=Object.getOwnPropertyDescriptor(d,a);Object.defineProperty(e,a,l.get?l:{enumerable:!0,get:()=>d[a]})}}return e.default=d,Object.freeze(e)}const t=m(p),v=`
    uniform sampler2D map;
    uniform float opacity;

    uniform float uvdy;
    uniform float uvdx;

    varying float visibility;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPos;

    void main() {

    if ( visibility < 0.9 ) discard;

    vec4 color = texture2D(map, vUv);
    color.w = opacity;

    gl_FragColor = color;

}
`,f=`

uniform float mindepth;
uniform float maxdepth;

uniform float width;
uniform float height;

uniform bool isPoints;
uniform float pointSize;

uniform float time;

uniform vec2 focalLength;
uniform vec2 principalPoint;
uniform vec2 imageDimensions;
uniform vec4 crop;
uniform vec2 meshDensity;
uniform mat4 extrinsics;

varying vec3 vNormal;
varying vec3 vPos;

uniform sampler2D map;

varying float visibility;
varying vec2 vUv;

const float _DepthSaturationThreshhold = 0.5; //a given pixel whose saturation is less than half will be culled (old default was .5)
const float _DepthBrightnessThreshold = 0.5; //a given pixel whose brightness is less than half will be culled (old default was .9)
const float  _Epsilon = .03;

vec3 rgb2hsv(vec3 c)
{
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + _Epsilon)), d / (q.x + _Epsilon), q.x);
}

float depthForPoint(vec2 texturePoint)
{
    vec4 depthsample = texture2D(map, texturePoint);
    vec3 depthsamplehsv = rgb2hsv(depthsample.rgb);
    return depthsamplehsv.g > _DepthSaturationThreshhold && depthsamplehsv.b > _DepthBrightnessThreshold ? depthsamplehsv.r : 0.0;
}

void main() {
    vec4 texSize = vec4(1.0 / width, 1.0 / height, width, height);

    vec2 centerpix = texSize.xy * .5;
    vec2 textureStep = 1.0 / meshDensity;
    vec2 basetex = floor(position.xy * textureStep * texSize.zw) * texSize.xy;
    vec2 imageCoordinates = crop.xy + (basetex * crop.zw);
    basetex.y = 1.0 - basetex.y;

    vec2 depthTexCoord = basetex * vec2(1.0, 0.5) + centerpix;
    vec2 colorTexCoord = basetex * vec2(1.0, 0.5) + vec2(0.0, 0.5) + centerpix;

    vUv = colorTexCoord;
    vPos = (modelMatrix * vec4(position, 1.0 )).xyz;
    vNormal = normalMatrix * normal;

    //check neighbors
    //texture coords come in as [0.0 - 1.0] for this whole plane
    float depth = depthForPoint(depthTexCoord);

    float neighborDepths[8];
    neighborDepths[0] = depthForPoint(depthTexCoord + vec2(0.0,  textureStep.y));
    neighborDepths[1] = depthForPoint(depthTexCoord + vec2(textureStep.x, 0.0));
    neighborDepths[2] = depthForPoint(depthTexCoord + vec2(0.0, -textureStep.y));
    neighborDepths[3] = depthForPoint(depthTexCoord + vec2(-textureStep.x, 0.0));
    neighborDepths[4] = depthForPoint(depthTexCoord + vec2(-textureStep.x, -textureStep.y));
    neighborDepths[5] = depthForPoint(depthTexCoord + vec2(textureStep.x,  textureStep.y));
    neighborDepths[6] = depthForPoint(depthTexCoord + vec2(textureStep.x, -textureStep.y));
    neighborDepths[7] = depthForPoint(depthTexCoord + vec2(-textureStep.x,  textureStep.y));

    visibility = 1.0;
    int numDudNeighbors = 0;
    //search neighbor verts in order to see if we are near an edge
    //if so, clamp to the surface closest to us
    if (depth < _Epsilon || (1.0 - depth) < _Epsilon)
    {
        // float depthDif = 1.0;
        float nearestDepth = 1.0;
        for (int i = 0; i < 8; i++)
        {
            float depthNeighbor = neighborDepths[i];
            if (depthNeighbor >= _Epsilon && (1.0 - depthNeighbor) > _Epsilon)
            {
                // float thisDif = abs(nearestDepth - depthNeighbor);
                if (depthNeighbor < nearestDepth)
                {
                    // depthDif = thisDif;
                    nearestDepth = depthNeighbor;
                }
            }
            else
            {
                numDudNeighbors++;
            }
        }

        depth = nearestDepth;
        visibility = 0.8;

        // blob filter
        if (numDudNeighbors > 6)
        {
            visibility = 0.0;
        }
    }

    // internal edge filter
    float maxDisparity = 0.0;
    for (int i = 0; i < 8; i++)
    {
        float depthNeighbor = neighborDepths[i];
        if (depthNeighbor >= _Epsilon && (1.0 - depthNeighbor) > _Epsilon)
        {
            maxDisparity = max(maxDisparity, abs(depth - depthNeighbor));
        }
    }
    visibility *= 1.0 - maxDisparity;

    float z = depth * (maxdepth - mindepth) + mindepth;
    vec4 worldPos = extrinsics * vec4((imageCoordinates * imageDimensions - principalPoint) * z / focalLength, z, 1.0);
    worldPos.w = 1.0;

    gl_Position = projectionMatrix * modelViewMatrix * worldPos;
}
`,r=256,c=256;class n{constructor(e="mesh",a,l,o=null){switch(this.video=document.createElement("video"),this.video.id="depthkit-video",this.video.crossOrigin="anonymous",this.video.setAttribute("crossorigin","anonymous"),this.video.setAttribute("webkit-playsinline","webkit-playsinline"),this.video.setAttribute("playsinline","playsinline"),this.video.src=l,o&&(this.video.poster=o),this.video.autoplay=!0,this.video.loop=!1,this.video.muted=!0,this.video.load(),this.videoTexture=new t.VideoTexture(this.video),this.videoTexture.minFilter=t.NearestFilter,this.videoTexture.magFilter=t.LinearFilter,this.videoTexture.format=t.RGBAFormat,this.videoTexture.generateMipmaps=!1,this.manager=new t.LoadingManager,this.props,n.geo||n.buildGeomtery(),this.material=new t.ShaderMaterial({uniforms:{map:{type:"t",value:this.videoTexture},time:{type:"f",value:0},mindepth:{type:"f",value:0},maxdepth:{type:"f",value:0},meshDensity:{value:new t.Vector2(r,c)},focalLength:{value:new t.Vector2(1,1)},principalPoint:{value:new t.Vector2(1,1)},imageDimensions:{value:new t.Vector2(512,828)},extrinsics:{value:new t.Matrix4},crop:{value:new t.Vector4(0,0,1,1)},width:{type:"f",value:0},height:{type:"f",value:0},opacity:{type:"f",value:1},isPoints:{type:"b",value:!1},pointSize:{type:"f",value:3}},vertexShader:f,fragmentShader:v,transparent:!0}),this.material.side=t.DoubleSide,e){case"wire":this.material.wireframe=!0,this.mesh=new t.Mesh(n.geo,this.material);break;case"points":this.material.uniforms.isPoints.value=!0,this.mesh=new t.Points(n.geo,this.material);break;default:this.mesh=new t.Mesh(n.geo,this.material);break}return this.jsonLoader=new t.FileLoader(this.manager),this.jsonLoader.setResponseType("json"),this.jsonLoader.load(a,s=>{this.props=s,this.material.uniforms.width.value=this.props.textureWidth,this.material.uniforms.height.value=this.props.textureHeight,this.material.uniforms.mindepth.value=this.props.nearClip,this.material.uniforms.maxdepth.value=this.props.farClip,this.material.uniforms.focalLength.value=this.props.depthFocalLength,this.material.uniforms.principalPoint.value=this.props.depthPrincipalPoint,this.material.uniforms.imageDimensions.value=this.props.depthImageSize,this.material.uniforms.crop.value=this.props.crop;let i=this.props.extrinsics;this.material.uniforms.extrinsics.value.set(i.e00,i.e10,i.e20,i.e30,i.e01,i.e11,i.e21,i.e31,i.e02,i.e12,i.e22,i.e32,i.e03,i.e13,i.e23,i.e33);let u=new t.BoxGeometry(this.props.boundsSize.x,this.props.boundsSize.y,this.props.boundsSize.z),g=new t.MeshBasicMaterial({color:16776960,wireframe:!0});this.collider=new t.Mesh(u,g),this.mesh.add(this.collider),this.collider.position.set(650,-200,-1900)}),this.mesh.frustumCulled=!1,this.mesh.depthkit=this,this.mesh.name="depthkit",this.mesh}static buildGeomtery(){const e=new t.BufferGeometry,a=[],l=[];for(let i=0;i<c;i++)for(let u=0;u<r;u++)a.push(u,i,0);for(var o=0;o<c-1;o++)for(var s=0;s<r-1;s++)l.push(s+o*r,s+(o+1)*r,s+1+o*r,s+1+o*r,s+(o+1)*r,s+1+(o+1)*r);e.setAttribute("position",new t.Float32BufferAttribute(a,3)),e.setIndex(new t.Uint16BufferAttribute(l,1)),n.geo=e}setPointSize(e){this.material.uniforms.isPoints.value?this.material.uniforms.pointSize.value=e:console.warn("Can not set point size because the current character is not set to render points")}setOpacity(e){this.material.uniforms.opacity.value=e}setLineWidth(e){this.material.wireframe?this.material.wireframeLinewidth=e:console.warn("Can not set the line width because the current character is not set to render wireframe")}play(){this.video.isPlaying?console.warn("Can not play because the character is already playing"):this.video.play()}stop(){this.video.currentTime=0,this.video.pause()}pause(){this.video.pause()}setLoop(e){this.video.loop=e}setVolume(e){this.video.volume=e}update(e){this.material.uniforms.time.value=e}toggleColliderVisiblity(){this.mesh.collider.visible=!this.mesh.collider.visible}dispose(){try{this.mesh.parent.remove(this.mesh)}catch(e){console.warn(e)}finally{this.mesh.traverse(e=>{e.geometry!==void 0&&(e.geometry.dispose(),e.material.dispose())})}}}h.DepthKit=n,Object.defineProperty(h,Symbol.toStringTag,{value:"Module"})});
