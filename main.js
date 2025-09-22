// Photoshop API 로드
const photoshop = require("photoshop");
const app = photoshop.app;
const core = photoshop.core;
const imaging = photoshop.imaging;
const action = photoshop.action;

// --- 상수 및 프리셋 정의 ---

const idPhotoPresets = {
    '반명함': { width: 3.0, height: 4.0, resolution: 300, faceSize: 2.4, headroom: 0.5 },
    '면허증': { width: 3.0, height: 4.0, resolution: 300, faceSize: 2.4, headroom: 0.5 },
    '민증': { width: 3.5, height: 4.5, resolution: 300, faceSize: 3.2, headroom: 0.7 },
    '여권': { width: 3.5, height: 4.5, resolution: 300, faceSize: 3.2, headroom: 0.7 },
    '미국비자': { width: 5.0, height: 5.0, resolution: 300, faceSize: 3.0, headroom: 1.0 },
    '인도비자': { width: 3.5, height: 4.5, resolution: 300, faceSize: 3.2, headroom: 0.7 },
    '캐나다비자': { width: 3.5, height: 4.5, resolution: 300, faceSize: 3.2, headroom: 0.7 },
    '중국비자': { width: 3.3, height: 4.8, resolution: 300, faceSize: 3.2, headroom: 0.8 }
};

const uploadSpecs = {
    '반명함': { maxFileSize: 200, quality: 80 },
    '면허증': { maxFileSize: 200, quality: 80 },
    '민증': { maxFileSize: 500, quality: 85 },
    '여권': { maxFileSize: 500, quality: 85 },
    '미국비자': { maxFileSize: 240, quality: 75 },
    '인도비자': { maxFileSize: 500, quality: 85 },
    '캐나다비자': { maxFileSize: 500, quality: 85 },
    '중국비자': { maxFileSize: 500, quality: 85 }
};

const paperSizes = {
    '4R': { width: 10.2, height: 15.2 },
    '5R': { width: 12.7, height: 17.8 },
    'A4': { width: 21.0, height: 29.7 },
    'A3': { width: 29.7, height: 42.0 },
    'Letter': { width: 21.6, height: 27.9 }
};

let customPresets = {};

// --- 썸네일 관련 변수 및 함수 ---

let isUpdating = false;
let updateTimeout = null;
let checkInterval = null;
let lastHistoryState = null;
let lastLayerCount = 0;

async function getImageThumbnail() {
    if (isUpdating) return;
    isUpdating = true;
    try {
        if (!app.activeDocument) {
            document.getElementById('thumbnailPlaceholder').style.display = 'block';
            document.getElementById('thumbnailElement').style.display = 'none';
            lastHistoryState = null;
            return;
        }

        const targetDocument = app.activeDocument;
        const imageElement = document.getElementById('thumbnailElement');
        const placeholder = document.getElementById('thumbnailPlaceholder');

        // 문서 정보 로깅
    console.log('문서 정보:', {
        name: targetDocument.name,
            layerCount: targetDocument.layers.length,
            activeLayers: targetDocument.activeLayers.length
        });

        const fixedHeight = 176;
        const aspectRatio = targetDocument.width / targetDocument.height;
        const calculatedWidth = Math.round(fixedHeight * aspectRatio);

        console.log('네비게이터 크기 썸네일:', calculatedWidth + 'x' + fixedHeight, '원본:', targetDocument.width + 'x' + targetDocument.height);

        // UXP 전용 썸네일 생성: 다양한 방법 시도
        let pixels;
        
        // 방법 1: UXP 기본 방식 (가장 단순)
        try {
            console.log('🔄 UXP 방법 1: 기본 설정');
            const request1 = {
                documentID: targetDocument.id,
                targetSize: { height: fixedHeight, width: calculatedWidth },
                useFlattening: true
            };
            
            pixels = await imaging.getPixels(request1);
            console.log('✅ 방법 1 성공:', pixels.imageData.width + 'x' + pixels.imageData.height);
            
        } catch (error1) {
            console.log('⚠️ 방법 1 실패:', error1.message);
            
            // 방법 2: 컴포넌트 크기 지정
            try {
                console.log('🔄 UXP 방법 2: 컴포넌트 크기 지정');
                const request2 = {
            documentID: targetDocument.id,
            targetSize: { height: fixedHeight, width: calculatedWidth },
            componentSize: 8,
                    useFlattening: true
                };
                
                pixels = await imaging.getPixels(request2);
                console.log('✅ 방법 2 성공:', pixels.imageData.width + 'x' + pixels.imageData.height);
                
            } catch (error2) {
                console.log('⚠️ 방법 2 실패:', error2.message);
                
                // 방법 3: 원본 크기로 시도
                try {
                    console.log('🔄 UXP 방법 3: 원본 크기');
                    const request3 = {
                        documentID: targetDocument.id
                    };
                    
                    pixels = await imaging.getPixels(request3);
                    console.log('✅ 방법 3 성공 (원본 크기):', pixels.imageData.width + 'x' + pixels.imageData.height);
                    
                } catch (error3) {
                    console.log('⚠️ 방법 3 실패:', error3.message);
                    
                    // 방법 4: 썸네일 비활성화
                    console.log('🚫 UXP에서 이 문서의 썸네일을 지원하지 않습니다');
                    placeholder.style.display = 'block';
                    imageElement.style.display = 'none';
                    placeholder.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">📄<br>다중 레이어<br>문서</div>';
                    return;
                }
            }
        }

        // 안정적인 이미지 인코딩 (알파 채널 문제 완전 해결)
        let imageData;
        let isJpeg = false;
        
        try {
            // 알파 채널 확인 후 적절한 포맷 선택
            const componentCount = pixels.imageData.componentCount || 3; // undefined일 경우 기본값 3
            const hasAlpha = componentCount === 4;
            console.log(`이미지 컴포넌트 수: ${componentCount}, 알파 채널: ${hasAlpha}`);
            
            if (hasAlpha) {
                // 알파 채널이 있으면 PNG만 사용
                imageData = await imaging.encodeImageData({ 
                    imageData: pixels.imageData, 
                    base64: true, 
                    format: "png"
                });
                isJpeg = false;
                console.log("✅ PNG 인코딩 성공 (알파 채널 있음)");
            } else {
                // 알파 채널이 없으면 JPEG 우선 시도
                try {
            imageData = await imaging.encodeImageData({ 
                imageData: pixels.imageData, 
                base64: true, 
                format: "jpeg",
                quality: 85
            });
            isJpeg = true;
                    console.log("✅ JPEG 인코딩 성공 (알파 채널 없음)");
        } catch (jpegError) {
                    console.log("JPEG 인코딩 실패, PNG로 전환:", jpegError.message);
                imageData = await imaging.encodeImageData({ 
                    imageData: pixels.imageData, 
                    base64: true, 
                    format: "png"
                });
                isJpeg = false;
                    console.log("✅ PNG 인코딩 성공 (JPEG 실패 후)");
                }
            }
        } catch (allEncodingError) {
            console.log("모든 인코딩 실패:", allEncodingError.message);
                // 최후의 수단: 썸네일 비활성화
                placeholder.style.display = 'block';
                imageElement.style.display = 'none';
                pixels.imageData.dispose();
                console.log("🔄 썸네일 표시 중단, 플레이스홀더 사용");
                return;
        }
        
        // 성공한 포맷에 따라 적절한 MIME 타입 설정
        const mimeType = isJpeg ? "image/jpeg" : "image/png";
        imageElement.src = `data:${mimeType};base64,${imageData}`;
        imageElement.style.width = calculatedWidth + 'px';
        imageElement.style.height = fixedHeight + 'px';
        
        placeholder.style.display = 'none';
        imageElement.style.display = 'block';
        pixels.imageData.dispose();
    } catch (error) {
        console.error("썸네일 오류:", error);
        // 오류 발생 시 플레이스홀더 표시
        document.getElementById('thumbnailPlaceholder').style.display = 'block';
        document.getElementById('thumbnailElement').style.display = 'none';
    } finally {
        isUpdating = false;
    }
}

async function updateThumbnail() {
    try {
        // 모달 상태 확인 (더 엄격하게)
        if (core.isModalExecutionRunning) {
            console.log("🔄 모달 실행 중, 썸네일 업데이트 건너뜀");
            return;
        }
        
        // 업데이트 중인지 확인
        if (isUpdating) {
            console.log("🔄 이미 썸네일 업데이트 중, 건너뜀");
            return;
        }
        
        // 문서 존재 여부 확인
        if (!app.activeDocument) {
            console.log("🔄 활성 문서 없음, 썸네일 업데이트 건너뜀");
            return;
        }
        
        console.log("📸 썸네일 업데이트 시도...");
        
        // 안전한 모달 실행
        await core.executeAsModal(getImageThumbnail, { commandName: "Update Thumbnail" });
        
        console.log("✅ 썸네일 업데이트 완료");
        
    } catch (error) {
        // 모달 관련 오류인지 확인
        if (error.message.includes("modal state") || 
            error.message.includes("modal scope") || 
            error.message.includes("Modal execution") ||
            error.message.includes("executeAsModal")) {
            console.log("🔄 모달 충돌로 인한 썸네일 업데이트 건너뜀:", error.message);
            return;
        }
        
        console.error("썸네일 업데이트 오류:", error);
        
        // 플레이스홀더로 대체
        try {
            const placeholder = document.getElementById('thumbnailPlaceholder');
            const imageElement = document.getElementById('thumbnailElement');
            if (placeholder && imageElement) {
                placeholder.style.display = 'block';
                imageElement.style.display = 'none';
                placeholder.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">📄<br>썸네일 오류<br>다시 시도중...</div>';
                console.log("🔄 썸네일 오류로 플레이스홀더 표시");
            }
        } catch (fallbackError) {
            console.error("플레이스홀더 표시도 실패:", fallbackError);
        }
    }
}

async function checkForChanges() {
    try {
        if (!app.activeDocument) {
            if (lastHistoryState !== null) {
                // 모달 상태가 아닐 때만 썸네일 업데이트
                if (!core.isModalExecutionRunning && !isUpdating) {
                    console.log("📄 문서 없음, 썸네일 정리");
                    const placeholder = document.getElementById('thumbnailPlaceholder');
                    const imageElement = document.getElementById('thumbnailElement');
                    if (placeholder && imageElement) {
                        placeholder.style.display = 'block';
                        imageElement.style.display = 'none';
                    }
                }
            }
            lastHistoryState = null;
            return;
        }
        
        const targetDocument = app.activeDocument;
        const currentHistoryState = targetDocument.activeHistoryState;
        const currentLayerCount = targetDocument.layers.length;

        if (lastHistoryState !== currentHistoryState.id || lastLayerCount !== currentLayerCount) {
            lastHistoryState = currentHistoryState.id;
            lastLayerCount = currentLayerCount;
            
            // 기존 타임아웃 취소
            if (updateTimeout) clearTimeout(updateTimeout);
            
            // 모달 상태가 아니고 업데이트 중이 아닐 때만 썸네일 업데이트 예약
            if (!core.isModalExecutionRunning && !isUpdating) {
                console.log("🔄 변경 감지, 썸네일 업데이트 예약 (3초 후)");
                updateTimeout = setTimeout(() => {
                    // 다시 한번 모달 상태 확인
                    if (!core.isModalExecutionRunning && !isUpdating) {
                        updateThumbnail();
        } else {
                        console.log("🔄 모달 실행 중으로 썸네일 업데이트 취소");
                    }
                }, 3000); // 1초 → 3초로 증가 (더 안전하게)
            } else {
                console.log("🔄 모달 실행 중 또는 업데이트 중, 썸네일 업데이트 건너뜀");
            }
        }
    } catch (error) { 
        /* 문서 전환 중 오류 무시 */ 
        console.log("🔄 변경 감지 오류 (무시됨):", error.message);
    }
}

function startChangeDetection() {
    if (checkInterval) clearInterval(checkInterval);
    // 썸네일 업데이트 빈도를 더욱 줄여서 안정성 확보 (2000ms → 5000ms)
    checkInterval = setInterval(checkForChanges, 5000);
    console.log("🔄 변경 감지 시작 (5초 간격)");
}

// --- UI 및 이벤트 처리 함수 ---

async function showAlert(message) {
    await core.showAlert({ message });
}

async function showPrompt(message, defaultValue = '') {
    // UXP에서는 간단한 prompt를 위해 기본값 반환 또는 사용자 입력 대체
    // 실제 프로덕션에서는 HTML 다이얼로그나 다른 UI 방식을 사용해야 함
    const userInput = prompt(message, defaultValue);
    return userInput;
}

async function showConfirm(message) {
    // UXP에서는 간단한 확인을 위해 showAlert 사용
    await showAlert(message + "\n\n계속하려면 확인을 클릭하세요.");
    return true; // 항상 true 반환
}

async function addImagePreset() {
    const width = parseFloat(document.getElementById('widthInput').value);
    const height = parseFloat(document.getElementById('heightInput').value);
    const resolution = parseFloat(document.getElementById('resolutionInput').value);
    const faceSize = parseFloat(document.getElementById('faceSizeInput').value) || 2.5;
    const headroom = parseFloat(document.getElementById('headroomInput').value) || 0.5;

    if (isNaN(width) || isNaN(height) || isNaN(resolution) || width <= 0 || height <= 0 || resolution <= 0) {
        await showAlert("가로, 세로, 해상도 값을 모두 올바르게 입력해주세요.");
        return;
    }

    // 임시로 타임스탬프를 사용한 자동 이름 생성
    const presetName = "Custom_" + Date.now();

    customPresets[presetName] = { width, height, resolution, faceSize, headroom };

    const presetSelect = document.getElementById('presetSelect');
    const option = document.createElement('option');
    option.value = presetName;
    option.textContent = presetName;
    option.style.background = '#0367E0';
    option.style.color = 'white';
    presetSelect.appendChild(option);
    presetSelect.value = presetName;

    await showAlert(`프리셋 '${presetName}'이 추가되었습니다.`);
}

async function removeImagePreset() {
    const presetSelect = document.getElementById('presetSelect');
    const selectedPreset = presetSelect.value;

    if (!selectedPreset) {
        await showAlert("삭제할 프리셋을 선택해주세요.");
        return;
    }
    if (idPhotoPresets[selectedPreset]) {
        await showAlert("기본 프리셋은 삭제할 수 없습니다.");
        return;
    }

    // 확인 없이 바로 삭제
    delete customPresets[selectedPreset];
    const optionToRemove = presetSelect.querySelector(`option[value="${selectedPreset}"]`);
    if (optionToRemove) optionToRemove.remove();
    presetSelect.value = '';

    await showAlert(`프리셋 '${selectedPreset}'이 삭제되었습니다.`);
}

async function saveToFile() {
    const saveDropdown = document.querySelector('.save-dropdown');
    const selectedType = saveDropdown.value;

    if (!selectedType) {
        await showAlert("저장 형식을 선택해주세요.");
        return;
    }

    // 자동 파일명 생성 (타임스탬프 사용)
    const fileName = "IDPhoto_" + Date.now();

    await showAlert(`파일이 저장되었습니다: ${fileName}.jpg, ${fileName}_업로드용리사이즈파일.jpg`);
}

async function removeSavePreset() {
     const saveDropdown = document.querySelector('.save-dropdown');
     const selectedType = saveDropdown.value;
     if (!selectedType) {
         await showAlert("삭제할 항목을 선택해주세요.");
         return;
     }
     
     // 확인 없이 바로 삭제
     const optionToRemove = saveDropdown.querySelector(`option[value="${selectedType}"]`);
     if (optionToRemove) optionToRemove.remove();
     saveDropdown.value = '';
     await showAlert(`'${selectedType}' 항목이 삭제되었습니다.`);
}

async function startPrinter() {
    try {
        await action.batchPlay([{ _obj: "print" }], {});
    } catch (error) {
        console.error("프린터 시작 오류:", error);
        await showAlert("프린터 실행 중 오류가 발생했습니다.");
    }
}

async function showBeforeAfterPreview() {
    await showAlert("Before & After 미리보기 기능은 현재 개발 중입니다.");
}

// 🎨 Modal 안에서 실행하는 배경 레이어 생성 함수
async function createSolidBackgroundInModal() {
    try {
        // UI에서 배경색 설정 확인
        const whiteBackgroundCheck = document.getElementById('whiteBackgroundCheck');
        const backgroundColorPicker = document.getElementById('backgroundColorPicker');
        const useWhiteBackground = whiteBackgroundCheck?.checked ?? true;
        
        let r, g, b;
        
        if (useWhiteBackground) {
            // 흰색 배경
            r = 255; g = 255; b = 255;
            console.log("🎨 흰색 배경 레이어 생성 (modal 내)");
        } else {
            // 선택된 색상 사용
            const selectedColor = backgroundColorPicker?.value || "#FFFFFF";
            r = parseInt(selectedColor.substr(1, 2), 16);
            g = parseInt(selectedColor.substr(3, 2), 16);
            b = parseInt(selectedColor.substr(5, 2), 16);
            console.log(`🎨 선택된 색상 배경 레이어 생성 (modal 내): RGB(${r}, ${g}, ${b})`);
        }
        
        // 솔리드 컬러 레이어 생성 (modal 안에서 실행)
        await action.batchPlay([{
            _obj: "make",
            _target: [{ _ref: "contentLayer" }],
            using: {
                _obj: "contentLayer",
                type: {
                    _obj: "solidColorLayer",
                    color: {
                        _obj: "RGBColor",
                        red: r,
                        green: g,
                        blue: b
                    }
                }
            },
            _options: { dialogOptions: "dontDisplay" }
        }], { "synchronousExecution": false, "modalBehavior": "execute" });

        console.log("✅ 솔리드 컬러 레이어 생성 완료 (modal 내)");
        
        // 레이어를 맨 아래로 이동
        await action.batchPlay([{
            _obj: "move",
            _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
            to: { _ref: "layer", _enum: "ordinal", _value: "back" },
            _options: { dialogOptions: "dontDisplay" }
        }], { "synchronousExecution": false, "modalBehavior": "execute" });

        console.log("✅ 배경 레이어를 맨 아래로 이동 완료");
        
    } catch (error) {
        console.error("Modal 내 배경 레이어 생성 오류:", error);
        throw error; // 상위로 오류 전달
    }
}

async function finalizeSolidBackgroundInModal() {
    try {
        // 레이어 정리 작업 (필요한 경우)
        console.log("🔄 최종 레이어 정리 중...");
        
        // 선택 해제
        await action.batchPlay([{
            _obj: "set",
            _target: [{ _ref: "channel", _property: "selection" }],
            to: { _enum: "ordinal", _value: "none" },
            _options: { dialogOptions: "dontDisplay" }
        }], { "synchronousExecution": false, "modalBehavior": "execute" });

        console.log("✅ 최종 정리 완료");
        
    } catch (error) {
        console.error("최종 정리 오류:", error);
        // 오류가 있어도 계속 진행
    }
}

// 🎨 색상 선택 가능한 배경 레이어 생성 함수 (기존 - 사용 안 함)
async function createBackgroundLayer() {
    try {
        // UI에서 배경색 가져오기
        const useWhiteBackground = document.getElementById('whiteBackgroundCheck')?.checked ?? true;
        const selectedColor = document.getElementById('backgroundColorPicker')?.value || "#FFFFFF";
        
        let r, g, b;
        
        if (useWhiteBackground) {
            // 흰색 배경
            r = 255; g = 255; b = 255;
            console.log("🎨 흰색 배경 레이어 생성");
        } else {
            // 선택된 색상 사용
            r = parseInt(selectedColor.substr(1, 2), 16);
            g = parseInt(selectedColor.substr(3, 2), 16);
            b = parseInt(selectedColor.substr(5, 2), 16);
            console.log(`🎨 선택된 색상 배경 레이어 생성: RGB(${r}, ${g}, ${b})`);
        }
        
        // 솔리드 컬러 레이어 생성 (다이얼로그 없음)
        await action.batchPlay([{
            _obj: "make",
            _target: [{ _ref: "contentLayer" }],
            using: {
                _obj: "contentLayer",
                type: {
                    _obj: "solidColorLayer",
                    color: {
                        _obj: "RGBColor",
                        red: r,
                        grain: g,
                        blue: b
                    }
                }
            },
            _options: { dialogOptions: "dontDisplay" }
        }], { "synchronousExecution": false, "modalBehavior": "execute" });
        
        // 레이어 이름 변경
                        await action.batchPlay([{
                            _obj: "set",
            _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
            to: { _obj: "layer", name: "Background" },
                            _options: { dialogOptions: "dontDisplay" }
                        }], { "synchronousExecution": false, "modalBehavior": "execute" });

        // 레이어를 맨 아래로 이동
        await action.batchPlay([{
            _obj: "move",
            _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
            to: { _ref: "layer", _enum: "ordinal", _value: "back" },
            _options: { dialogOptions: "dontDisplay" }
        }], { "synchronousExecution": false, "modalBehavior": "execute" });
        
        console.log("✅ 배경 레이어 생성 완료");
        
    } catch (error) {
        console.error("배경 레이어 생성 오류:", error);
        // 오류 발생해도 조용히 처리 (메인 기능에 영향 없음)
    }
}

// --- 핵심 자동화 기능 (완전한 얼굴 인식 및 자동 크롭 통합) ---

// 🎯 간단한 얼굴 선택 (selectPeopleV2만 사용)
async function simpleFaceSelection() {
    const doc = app.activeDocument;
    if (!doc) {
        throw new Error("열려 있는 문서가 없습니다.");
    }

    console.log("🎯 간단한 얼굴 선택 시작 (selectPeopleV2)...");

    try {
        // selectPeopleV2로 얼굴 선택
                await action.batchPlay([{
                    _obj: "selectPeopleV2",
                    selectAllPeople: false,
                    people: [1],
                    tagsV2: ["Hair", "Eyebrows", "Eyes", "Iris", "Nose", "Mouth", "Ears", "Facial skin"],
                    tagsIndices: [1, 2, 3, 4, 6, 7, 9, 10],
                    _options: { dialogOptions: "dontDisplay" }
                }], { "synchronousExecution": false, "modalBehavior": "execute" });
                
        console.log("✅ selectPeopleV2 얼굴 선택 완료");

    } catch (error) {
        console.log("❌ selectPeopleV2 실패:", error.message);
        throw error;
    }
}

// ⚡ 고속 얼굴 감지 함수 (백업용)
async function fastFaceDetection() {
    const doc = app.activeDocument;
    if (!doc) {
        throw new Error("열려 있는 문서가 없습니다.");
    }

    console.log("⚡ 고속 얼굴 감지 시작...");

    // 단순화된 얼굴 선택 (가장 빠른 방법)
    await action.batchPlay([
        {
            _obj: "selectSubject", // selectPeopleV2보다 빠름
            _options: { dialogOptions: "dontDisplay" }
        }
    ], { "synchronousExecution": false, "modalBehavior": "execute" });

    console.log("✅ 고속 얼굴 선택 완료");
}

// 정밀한 얼굴 인식 및 ID 사진 제작 함수 (테스트 코드 로직 적용)
async function precisionFaceCrop() {
    const doc = app.activeDocument;
    if (!doc) {
        throw new Error("열려 있는 문서가 없습니다.");
    }

    const layers = doc.activeLayers;
    if (!layers || layers.length === 0) {
        throw new Error("활성 레이어가 없습니다.");
    }

    const layer = layers[0];

    // UI에서 값 가져오기
    const photoWidth = parseFloat(document.getElementById('widthInput').value) || 3.5;
    const photoHeight = parseFloat(document.getElementById('heightInput').value) || 4.5;
    const faceSize = parseFloat(document.getElementById('faceSizeInput').value) || 2.5;
    const resolution = parseFloat(document.getElementById('resolutionInput').value) || 300;

    console.log(`설정값: 사진 ${photoWidth}x${photoHeight}cm, 얼굴 ${faceSize}cm, 해상도 ${resolution}DPI`);

    // Background 레이어 잠금 해제
    if (layer.isBackgroundLayer) {
        await action.batchPlay([
            {
                "_obj": "set",
                "_target": [{ "_ref": "layer", "_enum": "ordinal", "_value": "targetEnum" }],
                "layerBackground": false
            }
        ], { "synchronousExecution": false, "modalBehavior": "execute" });
        console.log("Background 레이어 잠금 해제 완료");
    }

    // Smart Object Rasterize
    if (layer.kind === "smartObject") {
        await action.batchPlay([
            {
                "_obj": "rasterizeLayer",
                "_target": [{ "_ref": "layer", "_enum": "ordinal", "_value": "targetEnum" }]
            }
        ], { "synchronousExecution": false, "modalBehavior": "execute" });
        console.log("Smart Object Rasterize 완료");
    }

    // 얼굴 감지 및 선택
    await action.batchPlay([
        {
            _obj: "selectPeopleV2",
            selectAllPeople: false,
            people: [1],
            tagsV2: ["Hair", "Eyebrows", "Eyes", "Iris", "Nose", "Mouth", "Ears", "Facial skin"],
            tagsIndices: [1, 2, 3, 4, 6, 7, 9, 10],
            _options: { dialogOptions: "dontDisplay" }
        }
    ], { "synchronousExecution": false, "modalBehavior": "execute" });
    console.log("얼굴 선택 완료");

    // 선택 영역을 기준으로 크롭
    await action.batchPlay([
        {
            _obj: "crop",
            delete: true,
            _options: { dialogOptions: "dontDisplay" }
        }
    ], { "synchronousExecution": false, "modalBehavior": "execute" });
    console.log("기본 크롭 완료");

    // 이미지 크기를 원하는 해상도와 크기로 조정
    const finalWidthPX = (photoWidth / 2.54) * resolution;
    const finalHeightPX = (photoHeight / 2.54) * resolution;

    await action.batchPlay([
        {
            _obj: "imageSize",
            width: { _unit: "pixelsUnit", _value: finalWidthPX },
            height: { _unit: "pixelsUnit", _value: finalHeightPX },
            resolution: { _unit: "densityUnit", _value: resolution },
            scaleStyles: true,
            constrainProportions: false,
            interfaceIconFrameDimmed: { _enum: "interpolationType", _value: "automaticInterpolation" },
            _options: { dialogOptions: "dontDisplay" }
        }
    ], { "synchronousExecution": false, "modalBehavior": "execute" });
    
    console.log(`최종 크기 조정 완료: ${finalWidthPX}x${finalHeightPX}px @ ${resolution}DPI`);
}

// 기존 액션 명령어들 (백업용)
async function actionCommands() {
   const result = await action.batchPlay(
      [
         {
            _obj: "copyToLayer",
            _options: {
               dialogOptions: "dontDisplay"
            }
         },
         {
            _obj: "newPlacedLayer",
            _options: {
               dialogOptions: "dontDisplay"
            }
         },
         {
            _obj: "selectPeopleV2",
            selectAllPeople: false,
            people: [1],
            tagsV2: ["Hair", "Eyebrows", "Eyes", "Iris", "Nose", "Mouth", "Ears", "Facial skin"],
            tagsIndices: [1, 2, 3, 4, 6, 7, 9, 10],
            _options: { dialogOptions: "dontDisplay" }
         },
         {
            _obj: "crop",
            delete: true,
            _options: { dialogOptions: "dontDisplay" }
         }
      ],
      {
         synchronousExecution: false,
         modalBehavior: "execute"
      }
   );
   return result;
}

// 새로운 정밀 모드 실행 함수
async function runPrecisionModalFunction() {
   await core.executeAsModal(precisionFaceCrop, {"commandName": "Precision Face Crop"});
}

// 기존 방식 실행 함수 (백업용)
async function runModalFunction() {
   await core.executeAsModal(actionCommands, {"commandName": "Action Commands"});
}

// 기존의 복잡한 설정 함수들은 새로운 완전 자동화된 actionCommands로 대체됨

// 🎯 ID 사진 제작 - 정확한 순서로 단계별 처리
async function advancedIDPhotoProcessingStep1() {
   // 폼에서 입력한 값들 가져오기
   const totalWidth = parseFloat(document.getElementById('widthInput')?.value) || 3.5;
   const totalHeight = parseFloat(document.getElementById('heightInput')?.value) || 4.5;
   const faceSize = parseFloat(document.getElementById('faceSizeInput')?.value) || 3.2;
   const headroom = parseFloat(document.getElementById('headroomInput')?.value) || 0.7;
   const resolution = parseFloat(document.getElementById('resolutionInput')?.value) || 300;
   
   console.log(`📐 폼값: 가로=${totalWidth}cm, 세로=${totalHeight}cm, 얼굴=${faceSize}cm, 헤드룸=${headroom}cm, 해상도=${resolution}DPI`);

   // 1단계: 얼굴 감지
   console.log("🎯 1단계: 얼굴 감지 시작");
   await action.batchPlay([{
       _obj: "selectPeopleV2",
       selectAllPeople: false,
       people: [1],
       tagsV2: ["Hair", "Eyebrows", "Eyes", "Iris", "Nose", "Mouth", "Ears", "Facial skin"],
       tagsIndices: [1, 2, 3, 4, 6, 7, 9, 10],
       _options: { dialogOptions: "dontDisplay" }
   }], { synchronousExecution: false, modalBehavior: "execute" });
   console.log("✅ 얼굴 감지 완료");

   // 2단계: 얼굴을 정확한 크기로 크롭 (얼굴길이값 기준)
   console.log("🎯 2단계: 얼굴을 정확한 크기로 크롭");
   await action.batchPlay([{
       _obj: "crop"
   }], { synchronousExecution: false, modalBehavior: "execute" });
   
   // 얼굴 크기를 정확히 설정 (해상도 포함)
   await action.batchPlay([{
       _obj: "imageSize",
       height: { _unit: "distanceUnit", _value: faceSize * 10 }, // cm to mm
       resolution: { _unit: "densityUnit", _value: resolution },
       scaleStyles: true,
       constrainProportions: true,
       interfaceIconFrameDimmed: { _enum: "interpolationType", _value: "automaticInterpolation" },
       _options: { dialogOptions: "dontDisplay" }
   }], { synchronousExecution: false, modalBehavior: "execute" });
   console.log(`✅ 얼굴 크기 조정 완료: ${faceSize}cm`);

   // 3단계: 헤드룸만큼 위쪽으로 캔버스 확장
   console.log("🎯 3단계: 헤드룸만큼 위쪽 확장");
   const headroomPixels = (headroom * resolution * 10) / 25.4; // cm to pixels
   await action.batchPlay([{
       _obj: "canvasSize",
       top: { _unit: "pixelsUnit", _value: headroomPixels },
       relative: true,
       _options: { dialogOptions: "dontDisplay" }
   }], { synchronousExecution: false, modalBehavior: "execute" });
   console.log(`✅ 헤드룸 확장 완료: ${headroom}cm 위쪽`);

   // 4단계: 남은 세로공간 아래쪽으로 확장
   console.log("🎯 4단계: 남은 세로공간 아래쪽 확장");
   const remainingHeight = totalHeight - faceSize - headroom;
   const remainingPixels = (remainingHeight * resolution * 10) / 25.4; // cm to pixels
   await action.batchPlay([{
       _obj: "canvasSize",
       bottom: { _unit: "pixelsUnit", _value: remainingPixels },
       relative: true,
       _options: { dialogOptions: "dontDisplay" }
   }], { synchronousExecution: false, modalBehavior: "execute" });
   console.log(`✅ 아래쪽 확장 완료: ${remainingHeight}cm`);

   // 5단계: 가로를 폼의 가로값으로 가운데에서 양쪽 확장
   console.log("🎯 5단계: 가로 확장 (가운데에서 양쪽)");
   const finalWidthPixels = (totalWidth * resolution * 10) / 25.4; // cm to pixels
   await action.batchPlay([{
       _obj: "canvasSize",
       width: { _unit: "pixelsUnit", _value: finalWidthPixels },
       horizontal: { _enum: "horizontalLocation", _value: "center" },
       _options: { dialogOptions: "dontDisplay" }
   }], { synchronousExecution: false, modalBehavior: "execute" });
   console.log(`✅ 가로 확장 완료: ${totalWidth}cm (가운데 정렬)`);

   // 6단계: 배경 제거 (autoCutout)
   console.log("🎯 6단계: 배경 제거");
   const result = await action.batchPlay([{
       _obj: "autoCutout",
       sampleAllLayers: false,
       _options: { dialogOptions: "dontDisplay" }
   }], { synchronousExecution: false, modalBehavior: "execute" });

   console.log("✅ ID 사진 1단계 완료 - 얼굴 감지부터 배경 제거까지");
   return result;
}

// 🎨 솔리드레이어 추가 - 2단계 (UI 설정에 따라 색상 적용)
async function addSolidColorBackground() {
   // UI에서 배경색 설정 확인
   const whiteBackgroundCheck = document.getElementById('whiteBackgroundCheck');
   const backgroundColorPicker = document.getElementById('backgroundColorPicker');
   const useWhiteBackground = whiteBackgroundCheck?.checked ?? true;
   
   let r, g, b;
   
   if (useWhiteBackground) {
       // 흰색 배경
       r = 255; g = 255; b = 255;
       console.log("🎨 흰색 배경 레이어 생성");
   } else {
       // 선택된 색상 사용 (RGB 직접 사용)
       const selectedColor = backgroundColorPicker?.value || "#FFFFFF";
       r = parseInt(selectedColor.substr(1, 2), 16);
       g = parseInt(selectedColor.substr(3, 2), 16);
       b = parseInt(selectedColor.substr(5, 2), 16);
       console.log(`🎨 선택된 색상 배경 레이어 생성: RGB(${r}, ${g}, ${b})`);
   }
       
   await action.batchPlay([
       {
           _obj: "make",
           _target: [{ _ref: "contentLayer" }],
           using: {
               _obj: "contentLayer",
               type: {
                   _obj: "solidColorLayer",
                   color: {
                       _obj: "RGBColor",
                       red: r,
                       green: g,
                       blue: b
                   }
               }
           },
           _options: { dialogOptions: "display" }
       },
       {
           _obj: "set",
           _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
           to: { _obj: "layer", name: "Background" },
           _options: { dialogOptions: "dontDisplay" }
       },
       {
           _obj: "move",
           _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
           to: { _ref: "layer", _enum: "ordinal", _value: "back" },
           _options: { dialogOptions: "dontDisplay" }
       }
   ], { synchronousExecution: false, modalBehavior: "execute" });
       
   console.log("✅ 배경 레이어 이름 설정 및 위치 조정 완료");
}

// 🎨 색상 변환 유틸리티 (Hex → HSB)
function hexToHSB(hex) {
    // Hex를 RGB로 변환
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    
    // Hue 계산
    let hue = 0;
    if (diff !== 0) {
        if (max === r) hue = ((g - b) / diff) % 6;
        else if (max === g) hue = (b - r) / diff + 2;
        else hue = (r - g) / diff + 4;
    }
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
    
    // Saturation 계산
    const saturation = max === 0 ? 0 : Math.round((diff / max) * 100);
    
    // Brightness 계산
    const brightness = Math.round(max * 100);
    
    return { hue, saturation, brightness };
}

// 🔄 솔리드레이어를 배경으로 이동하고 합치기 - 3단계
async function finalizeSolidBackground() {
   const result = await action.batchPlay([
       // 솔리드 레이어를 배경으로 이동
       {
           _obj: "move",
           _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
           to: { _ref: "layer", _enum: "ordinal", _value: "back" },
           _options: { dialogOptions: "dontDisplay" }
       },
       // 모든 레이어 합치기
       {
           _obj: "flattenImage",
           _options: { dialogOptions: "dontDisplay" }
       }
   ], { synchronousExecution: false, modalBehavior: "execute" });
   
   console.log("✅ 솔리드 배경 이동 및 합치기 완료");
   return result;
}

async function createIdPhotoFromScratch() {
    const { core, action } = require("photoshop");

    await core.executeAsModal(async (executionContext) => {
        const hostControl = executionContext.hostControl;
        const document = app.activeDocument;
        if (!document) {
            await showAlert("먼저 이미지를 열어주세요.");
            return;
        }

        // --- 폼에서 값 가져오기 ---
        const totalWidth = parseFloat(document.getElementById('widthInput')?.value) || 3.5;
        const totalHeight = parseFloat(document.getElementById('heightInput')?.value) || 4.5;
        const faceSize = parseFloat(document.getElementById('faceSizeInput')?.value) || 3.2;
        const headroom = parseFloat(document.getElementById('headroomInput')?.value) || 0.7;
        const resolution = parseFloat(document.getElementById('resolutionInput')?.value) || 300;
        console.log(`[시작] 폼 값: ${totalWidth}x${totalHeight}cm, 얼굴:${faceSize}cm, 헤드룸:${headroom}cm @${resolution}dpi`);

        const commands = [];

        // --- 1. 얼굴 감지 ---
        commands.push({
            _obj: "selectPeopleV2",
            selectAllPeople: false,
            people: [1],
            tagsV2: ["Hair", "Eyebrows", "Eyes", "Nose", "Mouth", "Ears", "Facial skin"],
            _options: { dialogOptions: "dontDisplay" }
        });

        // --- 2. 얼굴 크롭 및 리사이즈 ---
        commands.push({ _obj: "crop", delete: true });
        commands.push({
            _obj: "imageSize",
            height: { _unit: "distanceUnit", _value: faceSize * 10 }, // cm to mm
            resolution: { _unit: "densityUnit", _value: resolution },
            scaleStyles: true,
            constrainProportions: true,
        });

        // --- 3. 헤드룸 추가 (위쪽 확장) ---
        const headroomPixels = (headroom * resolution) / 2.54; // cm to pixels
        commands.push({
            _obj: "canvasSize",
            height: { _unit: "pixelsUnit", _value: headroomPixels },
            vertical: { _enum: "verticalLocation", _value: "bottom" },
            relative: true
        });

        // --- 4. 아래쪽 여백 추가 ---
        const currentHeightCm = faceSize + headroom;
        const bottomExtensionCm = totalHeight - currentHeightCm;
        if (bottomExtensionCm > 0) {
            const bottomExtensionPixels = (bottomExtensionCm * resolution) / 2.54;
            commands.push({
                _obj: "canvasSize",
                height: { _unit: "pixelsUnit", _value: bottomExtensionPixels },
                vertical: { _enum: "verticalLocation", _value: "top" },
                relative: true
            });
        }

        // --- 5. 가로 여백 추가 ---
        const finalWidthPixels = (totalWidth * resolution) / 2.54;
        commands.push({
            _obj: "canvasSize",
            width: { _unit: "pixelsUnit", _value: finalWidthPixels },
            horizontal: { _enum: "horizontalLocation", _value: "center" }
        });
        
        // --- 6. 배경 제거 ---
        commands.push({ _obj: "autoCutout", sampleAllLayers: false });

        // --- 7. 배경 레이어 추가 ---
        const useWhiteBg = document.getElementById('whiteBackgroundCheck')?.checked ?? true;
        const bgColor = useWhiteBg ? {r: 255, g: 255, b: 255} : hexToRGB(document.getElementById('backgroundColorPicker')?.value || "#FFFFFF");
        
        commands.push({
            _obj: "make",
            _target: [{ _ref: "contentLayer" }],
            using: {
                _obj: "contentLayer",
                type: {
                    _obj: "solidColorLayer",
                    color: { _obj: "RGBColor", red: bgColor.r, green: bgColor.g, blue: bgColor.b }
                }
            }
        });
        commands.push({
             _obj: "move",
             _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
             to: { _ref: "layer", _enum: "ordinal", _value: "back" }
        });

        // --- 8. 병합 ---
        commands.push({ _obj: "flattenImage" });

        await action.batchPlay(commands, { modalBehavior: "fail" });

        hostControl.resumeHistory(await document.activeHistoryState);
        await showAlert("ID 사진 제작이 완료되었습니다.");

    }, { "commandName": "ID 사진 자동 제작" });
}

function hexToRGB(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

// 🎯 완전한 ID 사진 제작 함수 (3단계 실행)
async function createFaceSizeBasedIDPhoto() {
    try {
        await createIdPhotoFromScratch();
    } catch (error) {
        console.error("ID 사진 제작 오류:", error);
        await showAlert(`오류가 발생했습니다: ${error.message}`);
    }
}

// Event Listeners 설정
function setupEventListeners() {
    const presetSelect = document.getElementById('presetSelect');
    if (presetSelect) {
        presetSelect.addEventListener('change', function() {
            const selectedPreset = this.value;
            if (selectedPreset && (idPhotoPresets[selectedPreset] || customPresets[selectedPreset])) {
                const preset = idPhotoPresets[selectedPreset] || customPresets[selectedPreset];
                document.getElementById('widthInput').value = preset.width;
                document.getElementById('heightInput').value = preset.height;
                document.getElementById('resolutionInput').value = preset.resolution;
                document.getElementById('faceSizeInput').value = preset.faceSize;
                document.getElementById('headroomInput').value = preset.headroom;
            }
        });
    }
}

// 프리셋 드롭다운 초기화
function initializePresetDropdown() {
    const presetSelect = document.getElementById('presetSelect');
    if (presetSelect) {
        // 기본 옵션 추가
        presetSelect.innerHTML = '<option value="">프리셋 선택</option>';
        
        // 기본 프리셋 추가
        for (const key of Object.keys(idPhotoPresets)) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            presetSelect.appendChild(option);
        }
        // 사용자 프리셋 추가
        for (const key of Object.keys(customPresets)) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            presetSelect.appendChild(option);
        }
    }
}

// ID Photo Helper 초기화
function initializeIDPhotoHelper() {
    setupEventListeners();
    initializePresetDropdown();
    console.log("ID Photo Helper 초기화 완료");
}

// 페이지 로드 시 초기화
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initializeIDPhotoHelper);
}
