import { Modal } from 'antd';
import type { ResultItem } from './api';

interface TextModalProps {
  item: ResultItem;
  onClose: () => void;
}

export function TextModal({ item, onClose }: TextModalProps) {
  return (
    <Modal
      title={item.title || item.url}
      open
      onCancel={onClose}
      footer={null}
      width={800}
      styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
    >
      <pre
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          margin: 0,
          fontFamily: 'inherit',
          fontSize: 13,
        }}
      >
        {item.text}
      </pre>
    </Modal>
  );
}
