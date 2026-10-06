// Niebo (model Preetham z chmurami), slonce z cieniem podazajacym za graczem, mgla i mapa otoczenia do odbic.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { NIGHT } from './night.js';
import { FOG } from '../config.js';

const SHADOW_SIZE = 150; // polowa boku obszaru cienia [m]
const SHADOW_MAP = 4096;

export class Environment {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;

    this.sky = new Sky();
    this.sky.scale.setScalar(20000);
    this.sky.renderOrder = -2; // przed ziemia (ziemia nie zapisuje glebi, niebo nie moze jej zamalowac)
    scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.82;
    u.cloudCoverage.value = 0.35;
    u.cloudDensity.value = 0.5;

    this.sunDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.sun = new THREE.DirectionalLight(0xfff0d8, 3.6);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -SHADOW_SIZE;
    sc.right = sc.top = SHADOW_SIZE;
    sc.near = 10;
    sc.far = 2000;
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xc4d8f0, 0x5e584f, 0.75);
    scene.add(this.hemi);

    scene.fog = new THREE.Fog(0xbfcddb, FOG[0], FOG[1]);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.reflective = [];

    // noc: ciemna kopula z gwiazdami nad niebem Preethama (przezroczystosc rosnie po zachodzie)
    this.night = NIGHT;              // 0 = dzien, 1 = pelna noc; wspolne dla shaderow (okna, latarnie, pojazdy)
    this.nightSky = makeNightSky();
    this.nightSky.renderOrder = -1.5;
    scene.add(this.nightSky);
    // mgielka nad horyzontem w kolorze mgly: daleka ziemia (w pelni zamglona) przechodzi plynnie w niebo
    this.haze = makeHaze(scene.fog.color);
    this.haze.renderOrder = -1.4;
    scene.add(this.haze);

    this.clock = 16;                 // godzina (czas lokalny)
    this.timeScale = 1 / 60;         // godzin gry na sekunde (pelna doba w 24 minuty)
    this.dayOfYear = dayOfYear(new Date());
    this.lastEnv = null;
    this.applyTime(true);
  }

  // elewacja i azymut slonca w stopniach (azymut: 0 = polnoc, 90 = wschod)
  setSun(elevation, azimuth, env = true) {
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    // x = wschod, -z = polnoc
    this.sunDir.set(Math.sin(phi) * Math.sin(theta), Math.cos(phi), -Math.sin(phi) * Math.cos(theta)).normalize();
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    if (env) this.updateEnvMap();
  }

  // Polozenie slonca nad Warszawa (52.23 N, 21.01 E) dla dnia roku i godziny czasu lokalnego (CET/CEST)
  sunAt(hour) {
    const lat = THREE.MathUtils.degToRad(52.23);
    const decl = THREE.MathUtils.degToRad(-23.44 * Math.cos((2 * Math.PI / 365) * (this.dayOfYear + 10)));
    const summer = this.dayOfYear > 88 && this.dayOfYear < 300;
    const solar = hour - (summer ? 2 : 1) + 21.01 / 15;
    const H = THREE.MathUtils.degToRad(15 * (solar - 12));
    const el = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H));
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI;
    return { el: THREE.MathUtils.radToDeg(el), az: THREE.MathUtils.radToDeg(az) };
  }

  applyTime(force = false) {
    const { el, az } = this.sunAt(this.clock);
    const day = THREE.MathUtils.smoothstep(el, -4, 10);
    const n = 1 - THREE.MathUtils.smoothstep(el, -9, 2);
    this.night.value = n;
    // slonce lub (w nocy) ksiezyc jako swiatlo kierunkowe
    const lightEl = el > -2 ? Math.max(el, 3) : 35;
    const lightAz = el > -2 ? az : az + 180;
    const env = force || !this.lastEnv || Math.abs(this.lastEnv - el) > 2;
    this.setSun(el > -2 ? el : el, az, false);
    if (env) { this.updateEnvMap(); this.lastEnv = el; }
    const ph = THREE.MathUtils.degToRad(90 - lightEl), th = THREE.MathUtils.degToRad(lightAz);
    this.lightDir.set(Math.sin(ph) * Math.sin(th), Math.cos(ph), -Math.sin(ph) * Math.cos(th)).normalize();
    const warm = 1 - THREE.MathUtils.smoothstep(el, 2, 25);
    this.sun.color.setRGB(1, 0.94 - warm * 0.3, 0.85 - warm * 0.5);
    this.sun.intensity = 3.6 * day + 0.7 * n;
    if (n > 0.5) this.sun.color.setRGB(0.62, 0.7, 1.0);
    // noca miasto nie jest czarne: chlodne swiatlo nieba z luna + cieple odbicie od oswietlonych ulic
    this.hemi.intensity = 0.75;
    this.hemi.color.setRGB(0.77 * day + 0.3 * (1 - day), 0.85 * day + 0.33 * (1 - day), 0.94 * day + 0.46 * (1 - day));
    this.hemi.groundColor.setRGB(0.112 * day + 0.42 * (1 - day), 0.098 * day + 0.28 * (1 - day), 0.08 * day + 0.16 * (1 - day));
    this.renderer.toneMappingExposure = 0.72 + 0.28 * n;
    this.scene.environmentIntensity = 0.03 + 0.09 * day;
    const fog = this.scene.fog.color;
    // mgla ciemnieje szybciej niz swiatlo (o zmierzchu horyzont nie moze swiecic jasniej niz niebo)
    const dark = 1 - THREE.MathUtils.smoothstep(el, -6, 6);
    fog.setRGB(0.56, 0.62, 0.7).lerp(_dusk.setRGB(0.85, 0.6, 0.45), warm * day * 0.6).lerp(_night.setRGB(0.15, 0.12, 0.11), dark);
    this.nightSky.material.uniforms.opacity.value = Math.max(n, dark * 0.85);
    this.nightSky.visible = n > 0.01;
  }

  // HH:MM do HUD
  timeText() {
    const h = Math.floor(this.clock) % 24, m = Math.floor((this.clock % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  updateEnvMap() {
    const envScene = new THREE.Scene();
    const sky = new Sky();
    sky.scale.setScalar(1000);
    for (const k of Object.keys(this.sky.material.uniforms)) {
      const v = this.sky.material.uniforms[k].value;
      sky.material.uniforms[k].value = v?.clone ? v.clone() : v;
    }
    sky.material.uniforms.showSunDisc.value = 0;
    envScene.add(sky);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0, 1, 5000);
    // Uwaga: przy scene.environment three.js ignoruje material.envMapIntensity (uzywa scene.environmentIntensity).
    // Dlatego szklo i woda dostaja envMap bezposrednio (mocne odbicia), a reszta tylko slabe swiatlo otoczenia z nieba.
    this.scene.environment = this.envRT.texture;
    for (const m of this.reflective) {
      if (!m.envMap) m.needsUpdate = true;
      m.envMap = this.envRT.texture;
    }
  }

  // material z wyraznymi odbiciami nieba (szklo, woda)
  addReflective(material, intensity = 1) {
    material.envMapIntensity = intensity;
    material.envMap = this.envRT.texture;
    material.needsUpdate = true;
    this.reflective.push(material);
  }

  update(dt, focus) {
    this.sky.material.uniforms.time.value += dt;
    this.clock = (this.clock + dt * this.timeScale) % 24;
    this.applyTime();
    this.nightSky.position.copy(focus);
    this.haze.position.copy(focus);
    // cien podaza za graczem; przyciagniecie do teksela mapy cieni zapobiega migotaniu
    const texel = (SHADOW_SIZE * 2) / SHADOW_MAP;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx, 0, fz).addScaledVector(this.lightDir, 900);
    this.sun.target.updateMatrixWorld();
  }
}

const _dusk = new THREE.Color(), _night = new THREE.Color();

function dayOfYear(d) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}

// kopula nocnego nieba: gradient granat -> ciemny horyzont z poswiata miasta, gwiazdy z szumu
function makeNightSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform float opacity; varying vec3 vDir;
      float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        float y = max(vDir.y, 0.0);
        // luna nad miastem (swiatlo odbite od chmur i mgly), wyzej granat; gwiazd niewiele - jak w duzym miescie
        vec3 col = mix(vec3(0.15, 0.12, 0.11), vec3(0.025, 0.035, 0.075), smoothstep(0.0, 0.45, y));
        vec3 c = floor(vDir * 420.0);
        float s = step(0.9982, h(c)) * smoothstep(0.15, 0.45, y);
        col += vec3(s) * (0.35 + 0.3 * h(c + 1.0));
        gl_FragColor = vec4(col, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    // CustomBlending zamiast transparent: zostaje w kolejce nieprzezroczystych (renderOrder miedzy niebem a ziemia)
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), mat);
}

function makeHaze(fogColor) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: fogColor } },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 color; varying vec3 vDir;
      void main() {
        float a = 1.0 - smoothstep(-0.005, 0.11, vDir.y);
        gl_FragColor = vec4(color, a * a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(4800, 48, 24), mat);
}
