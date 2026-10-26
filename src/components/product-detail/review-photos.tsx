import React from "react";
import Image from "next/image";
import styles from "./pdp-reviews.module.css";

export function ReviewPhotos({
  photos,
  productName,
}: {
  photos: { id: string; url: string }[];
  productName: string;
}) {
  if (!photos.length) return null;
  return (
    <ul className={styles.photos} aria-label="Fotos de la compra">
      {photos.map((photo, index) => (
        <li key={photo.id}>
          <a
            href={photo.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Ampliar foto ${index + 1} de ${productName} (nueva pestaña)`}
          >
            <Image
              src={photo.url}
              alt={`Foto ${index + 1} de ${productName} enviada por el comprador`}
              width={120}
              height={120}
              loading="lazy"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
