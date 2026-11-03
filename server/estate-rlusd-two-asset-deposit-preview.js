'use strict';
// Pure math for a two-asset AMMDeposit, NOT a quote, signer, or funding job.
// XRPL tfTwoAsset consumes up to each stated amount in the existing pool ratio.
// A matched two-sided deposit has no swap-style price impact or AMM trading fee.
// The 1% acquisition-depth cap must not be applied to *deposit* principal.
// These amounts are maxima only; ledger validation must prove actual LP minted.
const SCALE=10n**18n;
const ROUND=10n**6n; // Conservative 12-decimal issued-asset upper bounds.
const DECIMAL=/^(0|[1-9][0-9]*)(?:\.([0-9]{1,18}))?$/;
function units(s,field){
 if(typeof s!=='string')throw Error(field+'_decimal_required');
 const m=DECIMAL.exec(s);
 if(!m)throw Error(field+'_decimal_required');
 return BigInt(m[1])*SCALE+BigInt((m[2]||'').padEnd(18,'0'));
}
function formatted(v){
 const rounded=(v/ROUND)*ROUND;
 const a=rounded/SCALE,b=(rounded%SCALE).toString().padStart(18,'0').slice(0,12).replace(/0+$/,'');
 return b?a.toString()+'.'+b:a.toString();
}
function previewProportionalEstateDeposit({
 poolImg,poolRlusd,availableImg,availableRlusd,
 priceDeviationBps='0',priceWarningThresholdBps='100'
}={}){
 const pi=units(poolImg,'pool_img'),pr=units(poolRlusd,'pool_rlusd');
 const ai=units(availableImg,'available_img'),ar=units(availableRlusd,'available_rlusd');
 const dev=units(priceDeviationBps,'price_deviation_bps'),threshold=units(priceWarningThresholdBps,'price_warning_threshold_bps');
 if(pi===0n||pr===0n)throw Error('nonempty_img_rlusd_pool_required');
 // Pick the limiting asset to produce a maximal ratio-preserving two-sided
 // deposit, even if that deposit exceeds the pool's current reserves.
 const imgLimited=ai*pr<=ar*pi;
 const rawImg=imgLimited?ai:ar*pi/pr;
 const rawRlusd=imgLimited?ai*pr/pi:ar;
 const img=(rawImg/ROUND)*ROUND;
 const rlusd=(rawRlusd/ROUND)*ROUND;
 const usable=img>0n&&rlusd>0n;
 const usedImg=usable?img:0n,usedRlusd=usable?rlusd:0n;
 return Object.freeze({
  readOnly:true,pool:'IMG/RLUSD',depositMode:'tfTwoAsset',
  equalValueAtCurrentPoolSpot:true,equalTokenQuantitiesRequired:false,
  maxImg:formatted(usedImg),maxRlusd:formatted(usedRlusd),
  illustrativeUnmatchedImg:formatted(ai-usedImg),
  illustrativeUnmatchedRlusd:formatted(ar-usedRlusd),
  bothAssetsAvailable:usable,
  indicativeDepositMayExceedCurrentPoolReserves:usedImg>pi&&usedRlusd>pr,
  sourceXrpAcquisitionDepthIsNotAnAmmDepositSizeCap:true,
  externalPriceDeviationBps:formatted(dev),
  marketPriceWarning:dev>threshold,
  marketPriceWarningDoesNotChangePoolRatio:true,
  issuerAndTrustlineVerificationRequired:true,
  validatedHoldingsAndFreshPoolSnapshotRequired:true,
  actualDebitsAndMintedLpRequireValidatedLedgerProof:true,
  actualDepositMayBeLessThanSpecifiedMaxima:true,
  nativeXrpOperatingReservePreservedOutsideThisCalculation:true,
  fundingAndPurchaseAuthorization:false
 });
}
module.exports={previewProportionalEstateDeposit};
