// Source-copy corrections only. Never normalize saved business data at render time.
export const UI_COPY_SPACING_RULES=[
 ['변경사항','변경 사항'],['선택사항','선택 사항'],['주의사항','주의 사항'],
 ['더이상','더 이상'],['한번에','한 번에'],['다시한번','다시 한번'],
 ['저장시','저장 시'],['선택시','선택 시'],['수정시','수정 시'],['삭제시','삭제 시'],
 ['등록시','등록 시'],['입력시','입력 시'],['변경시','변경 시'],['로그인시','로그인 시'],
 ['할수','할 수'],['될수','될 수'],['알수','알 수'],['볼수','볼 수'],
 ['수있습니다','수 있습니다'],['수없습니다','수 없습니다'],['수있어요','수 있어요'],['수없어요','수 없어요'],
 ['해주세요','해 주세요'],['해주시','해 주시'],['해주세','해 주세'],
 ['불러 오기','불러오기'],['불러 오는','불러오는'],['데이타','데이터'],
];
export const correctUiCopy=text=>UI_COPY_SPACING_RULES.reduce((value,[before,after])=>value.split(before).join(after),text);
