# Portable asteroid runtime

Этот runtime-модуль не зависит от React, Zustand или studio UI.

Назначение:

- быть источником истины для шейдера астероидов
- использоваться внутри studio
- переиспользоваться в `oni-web` напрямую из сабмодуля `rocktools`

## Состав

- `types.ts` — типы материала и реестр текстур
- `materialRuntime.ts` — portable shader/runtime helpers
- `index.ts` — barrel export

## Что должен делать consumer

1. загрузить `*.glb`
2. загрузить `*.json` с material params
3. загрузить общие texture assets
4. создать `THREE.MeshStandardMaterial`
5. применить `patchAsteroidMaterialShader()`
6. применить `applyAsteroidMaterialParams()`

## Ограничение

Этот runtime не хранит настройки сцены. Свет, окружение и background задает приложение-потребитель.
