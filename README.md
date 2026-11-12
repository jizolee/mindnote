# MindNote

Webapp kết hợp trang ghi chú kiểu Notion với mindmap. Mỗi dự án là một trang; các task lồng nhau của dự án xem được dưới dạng danh sách hoặc sơ đồ mindmap.

- Trang dự án: icon, tiêu đề, mô tả bằng block editor (gõ `/` để chèn khối, hỗ trợ phím tắt markdown).
- Task nhiều cấp, có ghi chú và các trường tuỳ biến (trạng thái, ưu tiên, hạn chót, nhãn…).
- Mindmap: thêm/sửa/xoá bằng bàn phím, kéo-thả để sắp xếp lại, pan và zoom.
- Dữ liệu lưu trong `localStorage` của trình duyệt, không cần server.

## Chạy

```bash
npm install
npm run dev
```

Build bản production vào `dist/`:

```bash
npm run build
```

Công nghệ: React, TypeScript, Vite.
