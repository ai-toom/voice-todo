// 音声認識（iPhone Safari の Web Speech API を使用）
(function (global) {
  const Recognition = global.SpeechRecognition || global.webkitSpeechRecognition;

  const Speech = {
    supported: !!Recognition,
    _rec: null,

    // onInterim(text) 途中経過 / onFinal(text) 確定 / onError(code) / onEnd()
    start({ onInterim, onFinal, onError, onEnd } = {}) {
      if (!Recognition) { onError && onError('unsupported'); return false; }
      this.stop();
      const rec = new Recognition();
      rec.lang = 'ja-JP';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      let finalText = '';
      let delivered = false;

      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += t; else interim += t;
        }
        onInterim && onInterim(finalText + interim);
      };
      rec.onerror = (e) => { onError && onError(e.error || 'error'); };
      rec.onend = () => {
        this._rec = null;
        const text = Speech.clean(finalText);
        if (text && !delivered) { delivered = true; onFinal && onFinal(text); }
        onEnd && onEnd(text);
      };
      try { rec.start(); } catch (e) { onError && onError('start-failed'); return false; }
      this._rec = rec;
      return true;
    },

    // 話し終わり（確定させる）
    finish() { if (this._rec) try { this._rec.stop(); } catch (e) {} },
    // 取り消し
    stop() { if (this._rec) { try { this._rec.abort(); } catch (e) {} this._rec = null; } },

    // 末尾の句点などを除去
    clean(t) { return (t || '').replace(/\s+/g, ' ').trim().replace(/[。．.、,]+$/u, '').trim(); },

    errorMessage(code) {
      switch (code) {
        case 'not-allowed':
        case 'service-not-allowed':
          return 'マイクの使用が許可されていません。設定アプリ →「Safari」→「マイク」で許可してください。';
        case 'no-speech': return '声が聞き取れませんでした。もう一度どうぞ。';
        case 'audio-capture': return 'マイクが使えません。';
        case 'network': return '音声認識にはネット接続が必要です。キーボードのマイクで入力できます。';
        case 'unsupported': return 'この環境は音声認識に未対応です。キーボードのマイクボタンで話してください。';
        default: return '音声入力を開始できませんでした。キーボードのマイクボタンで話してください。';
      }
    },
  };

  global.Speech = Speech;
})(window);
