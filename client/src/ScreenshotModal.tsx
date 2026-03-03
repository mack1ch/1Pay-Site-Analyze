import { Modal, Image, Button } from 'antd';

interface ScreenshotModalProps {
  url: string;
  onClose: () => void;
}

export function ScreenshotModal({ url, onClose }: ScreenshotModalProps) {
  return (
    <Modal
      title="Скриншот"
      open
      onCancel={onClose}
      footer={
        <Button type="primary" href={url} target="_blank" rel="noopener noreferrer">
          Открыть в полном размере
        </Button>
      }
      width="90vw"
      styles={{ body: { textAlign: 'center' } }}
    >
      <Image src={url} alt="Скриншот" style={{ maxWidth: '100%' }} />
    </Modal>
  );
}
