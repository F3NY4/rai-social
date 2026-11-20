# Модели и движки

Версии из npm, сверенные при разработке. wllama 3.13.0, WebLLM 0.2.89, Transformers.js 4.3.2, ONNX Runtime Web 1.31.1. В проект включён только wllama с локальной сборкой wllama-compat той же версии для браузеров без JSPI или Memory64. Он читает GGUF и даёт однопоточный WASM без обязательного cross-origin isolation. Доступный в этой версии WebGPU используется экспериментально. WebLLM требует подготовленных артефактов MLC и соответствующей WASM-библиотеки модели. Transformers.js использует ONNX, а его фактическая поддержка операторов зависит от модели и execution provider ONNX Runtime Web. Файлы Q4 и Q4F16 исследованной ONNX-конверсии Qwen 0.5B имеют размер 786 156 820 и 483 003 582 байт соответственно. [wllama](https://github.com/ngxson/wllama) · [WebLLM](https://webllm.mlc.ai/docs/user/advanced_usage.html) · [Transformers.js](https://huggingface.co/docs/transformers.js/main/en/index) · [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html) · [Конверсия Qwen](https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct)

| Модель | Формат | Размер, байт | Лицензия | Назначение |
|---|---|---:|---|---|
| Qwen2.5-0.5B-Instruct | GGUF Q4_K_M | 397 808 192 | Apache-2.0 | Основной кандидат для русского языка |
| SmolLM2-360M-Instruct | GGUF Q4_K_M | 270 590 880 | Apache-2.0 | Экономичный вариант преимущественно для английского |
| Qwen2.5-1.5B-Instruct | GGUF Q4_K_M | 986 048 768 | Apache-2.0 | Экспериментальный, доступен в Quality |
| Gemma 2 2B IT | GGUF Q4_K_M | 1 708 582 752 | Gemma Terms | Изучена, исключена из каталога по размеру и непроверенному запасу памяти |

Каталог фиксирует ревизию артефакта и SHA-256 LFS. Вес файла на диске не является пиковым расходом RAM. Фактический расход также зависит от KV-кэша, буферов, движка, браузера и одновременно открытых страниц. Пики на A15 не измерены. [Qwen 0.5B](https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF) · [SmolLM2 360M](https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF) · [Qwen 1.5B](https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF) · [Gemma 2](https://huggingface.co/bartowski/gemma-2-2b-it-GGUF)

| Режим | Окно контекста | Максимум токенов ответа |
|---|---:|---:|
| Eco | 1024 | 100 |
| Balanced | 1536 | 150 |
| Quality | 2048 | 210 |

Eco выбирает уже скачанную SmolLM2, если она доступна. Balanced выбирает Qwen 0.5B. Quality доступен только при выявленном адаптере WebGPU с `shader-f16`. Диагностика этого признака проверяет доступность API, совместимость и стабильность выбранных весов оцениваются запуском.
