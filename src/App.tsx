/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Upload, Select, Button, ConfigProvider, message, Card, 
  Typography, Divider, Checkbox, Modal, Input, Spin 
} from 'antd';
import { 
  InboxOutlined, SettingOutlined, FileTextOutlined, 
  CheckCircleOutlined, DownloadOutlined, KeyOutlined, RobotOutlined 
} from '@ant-design/icons';

// Các thư viện xử lý hiển thị và xuất file
import ReactMarkdown from 'react-markdown';
import { marked } from 'marked';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import katex from 'katex';

// Gemini SDK
import { GoogleGenAI, GenerateContentParameters } from "@google/genai";

const { Text } = Typography;

const App: React.FC = () => {
  // --- STATES ---
  const [subject, setSubject] = useState('Toán học');
  const [grade, setGrade] = useState('Lớp 12');
  const [isDigitalComp, setIsDigitalComp] = useState(true);
  const [isAI, setIsAI] = useState(false);
  
  const [lessonFileList, setLessonFileList] = useState<any[]>([]);
  const [ppctFileList, setPpctFileList] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  
  const [apiKey, setApiKey] = useState('');
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  useEffect(() => {
    // Ưu tiên API Key từ environment variable nếu có, sau đó đến localStorage
    const envKey = process.env.GEMINI_API_KEY;
    const savedKey = localStorage.getItem('gemini_api_key');
    
    if (envKey && envKey !== 'MY_GEMINI_API_KEY') {
      setApiKey(envKey);
    } else if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  const saveApiKey = () => {
    const input = document.getElementById('apiKeyInput') as HTMLInputElement;
    if (input && input.value.trim() !== '') {
      const key = input.value.trim();
      setApiKey(key);
      localStorage.setItem('gemini_api_key', key);
      setIsConfigOpen(false);
      message.success('Đã cấu hình API Key thành công!');
    } else {
      message.error('Vui lòng nhập API Key hợp lệ!');
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const processFile = async (file: File): Promise<any> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'txt') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve({ text: `\n--- Tài liệu: ${file.name} ---\n${e.target?.result}\n` });
        reader.onerror = () => reject(new Error('Lỗi đọc file TXT'));
        reader.readAsText(file);
      });
    } else if (ext === 'pdf') {
      const base64 = await fileToBase64(file);
      return { inlineData: { data: base64, mimeType: 'application/pdf' } };
    } else {
      throw new Error(`Định dạng ${ext} chưa hỗ trợ. Xin chuyển sang PDF.`);
    }
  };

  // --- XUẤT FILE WORD CÓ CÔNG THỨC TOÁN CHUẨN ---
  const handleDownloadWord = () => {
    if (!result) return;
    
    // Nâng cấp bộ nhận diện Toán học
    // Hỗ trợ tạo mã MathType (LaTeX) thuần để giáo viên dùng lệnh Toggle TeX hoặc phần mềm Convert vào MathType
    let mathBlocks: string[] = [];
    const protectMath = (text: string) => {
      let counter = 0;
      return text
        .replace(/\$\$(.*?)\$\$/gs, (match) => {
          mathBlocks[counter] = match;
          return `###MATH_BLOCK_${counter++}###`;
        })
        .replace(/\\\[(.*?)\\\]/gs, (match) => {
          // Chuẩn hóa lặp lại về $$ cho MathType dễ đọc nếu cần, hoặc giữ nguyên
          mathBlocks[counter] = match;
          return `###MATH_BLOCK_${counter++}###`;
        })
        .replace(/\$(.*?)\$/g, (match) => {
          mathBlocks[counter] = match;
          return `###MATH_BLOCK_${counter++}###`;
        })
        .replace(/\\\((.*?)\\\)/g, (match) => {
          mathBlocks[counter] = match;
          return `###MATH_BLOCK_${counter++}###`;
        });
    };

    const textProtected = protectMath(result);
    // @ts-ignore
    let htmlContent = marked.parse(textProtected) as string;
    
    // Khôi phục lại công thức nguyên bản (không render thành OMML nữa, để nguyên chuẩn text MathType)
    mathBlocks.forEach((math, i) => {
      htmlContent = htmlContent.replace(`###MATH_BLOCK_${i}###`, `<span>${math}</span>`);
    });
    
    // Bọc HTML vào cấu trúc file Word
    const preHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns:m='http://schemas.microsoft.com/office/2004/12/omml' xmlns:mml='http://www.w3.org/1998/Math/MathML' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>Giáo Án Năng Lực Số</title>
      <style>
        body { font-family: 'Times New Roman', Times, serif; font-size: 14pt; line-height: 1.5; }
        h1, h2, h3 { color: #1d4ed8; }
        table { border-collapse: collapse; width: 100%; margin-top: 10px; margin-bottom: 10px; }
        th, td { border: 1px solid black; padding: 8px; }
      </style>
    </head>
    <body>`;
    const postHtml = "</body></html>";
    const fullHtml = preHtml + htmlContent + postHtml;

    const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Giao_An_So_${subject}_${grade.replace(' ', '')}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    message.success('Đã xuất thành công file Word!');
  };

  // --- GỌI API GEMINI ---
  const handleGenerate = async () => {
    if (lessonFileList.length === 0) {
      message.warning('Vui lòng tải lên file Giáo án gốc (PDF/TXT)!');
      return;
    }
    if (!apiKey) {
      setIsConfigOpen(true);
      return;
    }

    setLoading(true);
    const msgKey = 'ai-process';
    message.loading({ content: `AI đang phân tích và xử lý môn ${subject} ${grade}...`, key: msgKey, duration: 0 });

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const promptText = `Bạn là chuyên gia giáo dục xuất sắc của Bộ GD&ĐT Việt Nam, am hiểu sâu sắc Năng lực số và Trí tuệ nhân tạo.
      
      YÊU CẦU CỐT LÕI (RẤT QUAN TRỌNG): 
      - Bạn BẮT BUỘC PHẢI GIỮ NGUYÊN 100% cấu trúc, nội dung và từng câu chữ của giáo án gốc. TUYỆT ĐỐI KHÔNG LƯỢC BỎ, KHÔNG TÓM TẮT.
      - Bạn chỉ được phép CHÈN THÊM nội dung hướng dẫn Năng lực số và Ứng dụng AI.
      
      THÔNG TIN CƠ BẢN:
      - Môn học: ${subject}
      - Khối lớp: ${grade}
      
      HƯỚNG DẪN BỔ SUNG NĂNG LỰC SỐ VÀ AI:
      1. Mục tiêu: Bổ sung thêm vào phần mục tiêu: "Năng lực số và Ứng dụng AI".
      2. Học liệu: Chèn thêm công cụ số và AI phù hợp (ví dụ: Canva, GeoGebra, Padlet, ChatGPT, Gemini...).
      3. Hoạt động học tập: Tại mỗi hoạt động, chèn thêm 1 mục nhỏ gợi ý tổ chức bằng công cụ số/AI.
      4. QUY TẮC ĐÁNH DẤU: Nội dung bổ sung phải in đậm và bắt đầu bằng: **[💡 BỔ SUNG NĂNG LỰC SỐ & AI]: ...**
      
      🔥 XỬ LÝ CÔNG THỨC TOÁN (CHUẨN MATHTYPE) 🔥:
      Do tài liệu gốc được chuyển từ PDF/Word, các phương trình/công thức có thể bị lỗi font.
      - BẠN PHẢI SỬA TOÀN BỘ CÔNG THỨC LỖI THÀNH DẠNG MÃ MATHTYPE (chuẩn LaTeX).
      - BẮT BUỘC bọc công thức trong dấu $ (cho trong dòng) hoặc $$ (cho khối riêng). VÍ DỤ: $\\int_{0}^{1} x^2 dx$
      
      Trả về kết quả định dạng Markdown. Bao gồm toàn bộ văn bản giáo án gốc kèm các đoạn chèn thêm.`;

      const parts: any[] = [{ text: promptText }];

      const lessonFile = lessonFileList[0].originFileObj;
      parts.push(await processFile(lessonFile));
      
      if (ppctFileList.length > 0) {
        const ppctFile = ppctFileList[0].originFileObj;
        parts.push(await processFile(ppctFile));
      }

      const params: GenerateContentParameters = {
        model: "gemini-3-flash-preview",
        contents: { parts: parts }
      };

      const response = await ai.models.generateContent(params);
      const generatedText = response.text;
      
      setResult(generatedText || "Không có kết quả.");
      message.success({ content: 'Đã hoàn thành!', key: msgKey, duration: 3 });

    } catch (error: any) {
      message.error({ content: `Lỗi: ${error.message}`, key: msgKey, duration: 5 });
    } finally {
      setLoading(false);
    }
  };

  const handleBeforeUpload = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf' && ext !== 'txt') {
      message.error('Hệ thống chỉ nhận file PDF hoặc TXT.');
      return Upload.LIST_IGNORE;
    }
    return false;
  };

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1d4ed8', borderRadius: 12, fontFamily: "'Inter', sans-serif" } }}>
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        
        {/* TOP BANNER */}
        <div className="max-w-6xl mx-auto bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-8 rounded-3xl shadow-2xl flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-wider mb-2">Trợ Lý Giáo Án Số 4.0</h1>
            <p className="text-blue-100 font-medium">Tự động chèn Năng lực số & Xuất Word công thức chuẩn</p>
          </div>
          <Button size="large" icon={<SettingOutlined />} ghost className="rounded-full font-bold" onClick={() => setIsConfigOpen(true)}>
            Cấu hình API Key
          </Button>
        </div>

        {/* MAIN CONTENT */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-8">
            <Card className="shadow-lg border-none rounded-3xl" title={<span className="text-blue-800 font-black text-lg"><FileTextOutlined className="mr-2"/> THIẾT LẬP THÔNG TIN</span>}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Môn học</label>
                  <Select className="w-full" value={subject} onChange={setSubject} size="large" showSearch>
                    {[
                      'Toán học', 'Tiếng Việt', 'Ngữ văn', 'Tiếng Anh', 
                      'Tự nhiên và Xã hội', 'Khoa học', 'Khoa học tự nhiên', 'Lịch sử và Địa lý', 
                      'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử', 'Địa lý', 
                      'Đạo đức', 'Giáo dục công dân', 'Giáo dục kinh tế và pháp luật', 
                      'Công nghệ', 'Tin học', 'Giáo dục thể chất', 'Âm nhạc', 'Mỹ thuật', 
                      'Hoạt động trải nghiệm', 'Giáo dục địa phương', 'Giáo dục quốc phòng và an ninh'
                    ].map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Khối lớp</label>
                  <Select className="w-full" value={grade} onChange={setGrade} size="large" showSearch>
                    {[...Array(12)].map((_, i) => <Select.Option key={i} value={`Lớp ${i + 1}`}>{`Lớp ${i + 1}`}</Select.Option>)}
                  </Select>
                </div>
              </div>
              <Divider className="my-6" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Checkbox checked={isDigitalComp} onChange={e => setIsDigitalComp(e.target.checked)} className="font-bold text-blue-900 bg-blue-50 p-4 rounded-xl border border-blue-100">Tích hợp Năng lực số</Checkbox>
                <Checkbox checked={isAI} onChange={e => setIsAI(e.target.checked)} className="font-bold text-indigo-900 bg-indigo-50 p-4 rounded-xl border border-indigo-100">Sử dụng Trí tuệ nhân tạo (AI)</Checkbox>
              </div>
            </Card>

            <Card className="shadow-lg border-none rounded-3xl" title={<span className="text-blue-800 font-black text-lg"><InboxOutlined className="mr-2"/> TÀI LIỆU ĐẦU VÀO</span>}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Upload.Dragger className="rounded-2xl bg-slate-50" accept=".pdf,.txt" multiple={false} fileList={lessonFileList} beforeUpload={handleBeforeUpload} onChange={info => setLessonFileList([...info.fileList].slice(-1).map(f => ({...f, status: 'done'})))} onRemove={() => setLessonFileList([])}>
                  <p className="ant-upload-drag-icon"><FileTextOutlined className="text-blue-500 text-4xl" /></p>
                  <p className="font-bold">Kéo thả Giáo án (PDF/TXT)</p>
                  <Text type="danger" className="text-xs font-bold mt-1">BẮT BUỘC</Text>
                </Upload.Dragger>
                <Upload.Dragger className="rounded-2xl bg-slate-50" accept=".pdf,.txt" multiple={false} fileList={ppctFileList} beforeUpload={handleBeforeUpload} onChange={info => setPpctFileList([...info.fileList].slice(-1).map(f => ({...f, status: 'done'})))} onRemove={() => setPpctFileList([])}>
                  <p className="ant-upload-drag-icon"><InboxOutlined className="text-indigo-400 text-4xl" /></p>
                  <p className="font-bold">Kéo thả PPCT (PDF/TXT)</p>
                  <Text className="text-xs text-gray-500 mt-1">TÙY CHỌN</Text>
                </Upload.Dragger>
              </div>
            </Card>

            <div className="flex justify-center py-4">
              <Button type="primary" size="large" className={`h-16 px-16 rounded-full font-black text-lg shadow-xl border-none ${loading ? 'bg-gray-400' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105'}`} onClick={handleGenerate} disabled={loading} icon={loading ? <Spin /> : <RobotOutlined className="text-2xl" />}>
                {loading ? 'ĐANG BIÊN SOẠN...' : 'YÊU CẦU AI SOẠN GIÁO ÁN'}
              </Button>
            </div>

            {result && (
              <Card className="shadow-2xl border-2 border-green-500/20 rounded-3xl" title={<span className="text-green-700 font-black text-xl"><CheckCircleOutlined /> KẾT QUẢ</span>} extra={<Button type="text" danger onClick={() => setResult(null)}>Xóa</Button>}>
                <div className="prose prose-blue max-w-none bg-white p-8 rounded-2xl border border-slate-200 overflow-auto max-h-[700px]">
                  {/* BỘ HIỂN THỊ CÔNG THỨC TOÁN HỌC TRÊN WEB */}
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {result}
                  </ReactMarkdown>
                </div>
                <div className="flex justify-center mt-8">
                  <Button type="primary" size="large" icon={<DownloadOutlined />} className="h-12 px-10 rounded-full font-bold bg-green-600 hover:bg-green-500 border-none" onClick={handleDownloadWord}>
                    TẢI VỀ MÁY (WORD - CÓ CÔNG THỨC TOÁN)
                  </Button>
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-8">
            <div className="bg-slate-800 text-white p-8 rounded-3xl shadow-xl">
              <h3 className="text-xl font-black mb-6 text-blue-400 border-b border-slate-700 pb-4">📋 HƯỚNG DẪN</h3>
              <ul className="space-y-6">
                <li className="flex gap-4"><div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-black text-blue-400 shrink-0">1</div><p className="text-sm mt-1">Cấu hình API Key từ AI Studio.</p></li>
                <li className="flex gap-4"><div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-black text-blue-400 shrink-0">2</div><p className="text-sm mt-1">Tải file PDF giáo án gốc lên.</p></li>
                <li className="flex gap-4"><div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-black text-white shrink-0">3</div><p className="text-sm mt-1">Bấm nút Bắt đầu, đợi AI hoàn thành và tải trực tiếp file Word về.</p></li>
              </ul>
            </div>
          </div>
        </div>

        <Modal title={<span className="text-xl font-black text-blue-800"><KeyOutlined /> Cấu hình Hệ thống AI</span>} open={isConfigOpen} onCancel={() => setIsConfigOpen(false)} footer={null} destroyOnClose centered>
          <div className="py-4">
            <Input.Password size="large" placeholder="Nhập API Key bắt đầu bằng AIzaSy..." defaultValue={apiKey} id="apiKeyInput" className="rounded-xl border-gray-300 mb-6" />
            <div className="flex justify-between items-center">
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 hover:underline">👉 Lấy API Key miễn phí tại đây</a>
              <div className="flex gap-3">
                <Button onClick={() => setIsConfigOpen(false)} className="rounded-full">Đóng</Button>
                <Button type="primary" onClick={saveApiKey} className="rounded-full bg-blue-600">Lưu cấu hình</Button>
              </div>
            </div>
          </div>
        </Modal>

      </div>
    </ConfigProvider>
  );
};

export default App;
