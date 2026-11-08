

// Supabaseの接続設定


const SUPABASE_URL = 'https://ejsmoevsnydnzjsvblyg.supabase.co'; //SupabaseプロジェクトURL
const SUPABASE_KEY = 'sb_publishable_7rRZC1foF3wjZ0FDUiaj1g_JVi8FA4b'; //公開キー

// クライアントの初期化
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function saveScanData(scannedCode, name) {
    try { //supabaseにスキャン情報を送る
        const { error } = await supabaseClient
            .from('scans')
            .insert([
                { 
                    product_code: scannedCode, 
                    product_name: name
                }
            ]);

        if (error) {
            console.error('Supabase保存エラー:', error);
        } else {
            console.log('スキャンデータをSupabaseに保存しました!');
        }
    } catch (err) {
        console.error('通信エラー:', err);
    }
}

async function fetchAllScans() {
    const { data, error } = await supabaseClient.from('scans').select('*');
    if (error) throw error;
    return data || [];
}